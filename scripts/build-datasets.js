const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const Papa = require("papaparse");

const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "raw");
const OUTPUT_DIR = path.join(ROOT, "data", "us");
const PUBLIC_OUTPUT_DIR = path.join(ROOT, "public", "data", "us");
const FAA_ARCHIVE_PATTERN = /^faa_nasr_(\d{4}-\d{2}-\d{2})_APT_CSV\.zip$/i;

function resolveFaaSource() {
  const candidates = fs
    .readdirSync(RAW_DIR)
    .map((fileName) => {
      const match = fileName.match(FAA_ARCHIVE_PATTERN);
      if (!match) return null;
      const fullPath = path.join(RAW_DIR, fileName);
      const stats = fs.statSync(fullPath);
      return {
        fileName,
        fullPath,
        cycleDate: match[1],
        modifiedAt: stats.mtime.getTime()
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.cycleDate !== b.cycleDate) {
        return b.cycleDate.localeCompare(a.cycleDate);
      }
      return b.modifiedAt - a.modifiedAt;
    });

  const latest = candidates[0];
  if (!latest) {
    throw new Error(
      `No FAA NASR archive found in ${RAW_DIR}. Expected file name like faa_nasr_YYYY-MM-DD_APT_CSV.zip.`
    );
  }

  return {
    name: "FAA NASR APT_BASE",
    file: latest.fullPath,
    fileName: latest.fileName,
    cycleDate: latest.cycleDate,
    inner: "APT_BASE.csv"
  };
}

const SOURCES = {
  faa: resolveFaaSource()
};

function normalizeId(value) {
  if (!value) return "";
  let cleaned = String(value).trim().toUpperCase();
  cleaned = cleaned.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
  if (!cleaned) return "";
  if (/^K[A-Z0-9]{3,4}$/.test(cleaned)) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

const STATE_LIST = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"]
];

const STATE_CODES = new Set(STATE_LIST.map(([code]) => code));

function parseCsv(text) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    throw new Error(parsed.errors[0].message);
  }
  return parsed.data.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      const cleanKey = key.replace(/^\uFEFF/, "");
      normalized[cleanKey] = row[key];
    }
    return normalized;
  });
}

function parseZipCsv(zipPath, innerName) {
  const text = execFileSync("unzip", ["-p", zipPath, innerName], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 200
  });
  return parseCsv(text);
}

function parseDecimal(value, hemis) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (hemis && (hemis === "W" || hemis === "S") && parsed > 0) {
    return -parsed;
  }
  return parsed;
}

function getUpdatedDate(filePath) {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const stats = fs.statSync(filePath);
  return stats.mtime.toISOString().slice(0, 10);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildFacilityList() {
  const records = new Map();

  const fieldRanks = {
    name: { faa: 0 },
    city: { faa: 0 },
    county: { faa: 0 },
    latitude: { faa: 0 },
    longitude: { faa: 0 }
  };

  function getOrCreate(id) {
    if (!records.has(id)) {
      records.set(id, {
        id,
        state: "",
        name: "",
        city: "",
        county: "",
        latitude: undefined,
        longitude: undefined,
        type: "airport",
        sources: new Set(),
        corroborated: false,
        _ranks: {
          name: 99,
          city: 99,
          county: 99,
          latitude: 99,
          longitude: 99
        }
      });
    }
    return records.get(id);
  }

  function applyField(entry, field, value, source) {
    if (value === undefined || value === null || value === "") return;
    const rank = fieldRanks[field][source];
    if (rank < entry._ranks[field]) {
      entry[field] = value;
      entry._ranks[field] = rank;
    }
  }

  function addSource(entry, source) {
    entry.sources.add(source);
  }

  const faaRows = parseZipCsv(SOURCES.faa.file, SOURCES.faa.inner);
  for (const row of faaRows) {
    if (!STATE_CODES.has(row.STATE_CODE)) continue;
    if (row.SITE_TYPE_CODE !== "A") continue;
    if (row.FACILITY_USE_CODE !== "PU") continue;
    const id = normalizeId(row.ARPT_ID || row.ICAO_ID);
    if (!id) continue;
    const entry = getOrCreate(id);
    addSource(entry, "faa");
    entry.state = row.STATE_CODE;
    applyField(entry, "name", row.ARPT_NAME || id, "faa");
    applyField(entry, "city", row.CITY || "", "faa");
    applyField(entry, "county", row.COUNTY_NAME || "", "faa");
    const lat = parseDecimal(row.LAT_DECIMAL, row.LAT_HEMIS);
    const lon = parseDecimal(row.LONG_DECIMAL, row.LONG_HEMIS);
    applyField(entry, "latitude", lat, "faa");
    applyField(entry, "longitude", lon, "faa");
  }

  const entries = Array.from(records.values());
  for (const entry of entries) {
    entry.corroborated = entry.sources.size > 1;
  }
  const facilities = entries
    .map((entry) => {
      const sources = Array.from(entry.sources).sort().join(";");
      return {
        id: entry.id,
        state: entry.state || "",
        name: entry.name || entry.id,
        city: entry.city || "",
        county: entry.county || "",
        latitude: entry.latitude,
        longitude: entry.longitude,
        type: entry.type || "airport",
        sources,
        corroborated: entry.corroborated ? "yes" : "no"
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const sourceCounts = {
    faa: { total: 0, corroborated: 0 }
  };

  for (const entry of entries) {
    for (const source of entry.sources) {
      sourceCounts[source].total += 1;
      if (entry.corroborated) {
        sourceCounts[source].corroborated += 1;
      }
    }
  }

  return { facilities, sourceCounts };
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function buildSourcesMetadata(sourceCounts) {
  const sources = [
    {
      key: "faa",
      name: SOURCES.faa.name,
      file: `data/raw/${SOURCES.faa.fileName} (${SOURCES.faa.inner})`,
      updated: SOURCES.faa.cycleDate || getUpdatedDate(SOURCES.faa.file),
      total: sourceCounts.faa.total,
      corroborated: sourceCounts.faa.corroborated
    }
  ];

  return sources.map((source) => {
    const ratio = source.total > 0 ? source.corroborated / source.total : 0;
    return {
      name: source.name,
      file: source.file,
      deduped: "yes",
      corroborated:
        source.total > 0 && ratio > 0
          ? `${formatPercent(ratio)} matched`
          : "single source",
      updated: source.updated,
      total: source.total
    };
  });
}

function writeCsv(filePath, facilities) {
  const header =
    "id,state,name,city,county,latitude,longitude,type,sources,corroborated";
  const lines = facilities.map((facility) => {
    const values = [
      facility.id,
      facility.state,
      facility.name,
      facility.city,
      facility.county,
      facility.latitude ?? "",
      facility.longitude ?? "",
      facility.type,
      facility.sources,
      facility.corroborated
    ].map((value) => {
      const str = String(value ?? "");
      if (str.includes(",") || str.includes("\"")) {
        return `"${str.replace(/\"/g, "\"\"")}"`;
      }
      return str;
    });
    return values.join(",");
  });

  fs.writeFileSync(filePath, [header, ...lines].join("\n"));
}

function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(PUBLIC_OUTPUT_DIR);

  const { facilities, sourceCounts } = buildFacilityList();
  const sourcesMeta = buildSourcesMetadata(sourceCounts);

  const csvPath = path.join(OUTPUT_DIR, "facilities_master.csv");
  const publicCsvPath = path.join(PUBLIC_OUTPUT_DIR, "facilities_master.csv");
  const sourcesPath = path.join(OUTPUT_DIR, "sources.json");
  const publicSourcesPath = path.join(PUBLIC_OUTPUT_DIR, "sources.json");

  writeCsv(csvPath, facilities);
  writeCsv(publicCsvPath, facilities);
  fs.writeFileSync(sourcesPath, JSON.stringify(sourcesMeta, null, 2));
  fs.writeFileSync(publicSourcesPath, JSON.stringify(sourcesMeta, null, 2));

  console.log(`Wrote ${facilities.length} facilities to ${csvPath}`);
  console.log(`Wrote sources metadata to ${sourcesPath}`);
}

main();
