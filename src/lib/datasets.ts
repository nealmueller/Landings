import Papa from "papaparse";
import { normalizeFacilityId } from "@/lib/normalize";

export type SurfaceCategory = "paved" | "unpaved" | "water" | "unknown";

export type Facility = {
  id: string;
  state?: string;
  name: string;
  city: string;
  county: string;
  latitude?: number;
  longitude?: number;
  towered?: boolean;
  longestRunwayFt?: number;
  surfaceCategory?: SurfaceCategory;
  source: "public" | "ourairports";
  type?: string;
  sources?: string;
  corroborated?: string;
};

export function parseFacilitiesMaster(csvText: string): Facility[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true
  });

  return parsed.data.flatMap((row) => {
    const rawId = row.id || row.AIRPORTID || row.AIRPORT_ID || row.AIRPORT || "";
    const id = normalizeFacilityId(rawId);
    if (!id) return [];

    const name = row.name || row.NAME || row.AIRPORTNAME || row.AIRPORT_NAME || "";
    const city = row.city || row.CITY || row.CITY_NAME || row.MUNICIPALITY || "";
    const county = row.county || row.COUNTY || "";
    const latitude = parseFloat(
      row.latitude || row.LATITUDE || row.LAT || ""
    );
    const longitude = parseFloat(
      row.longitude || row.LONGITUDE || row.LON || row.LONG || ""
    );
    const state = (row.state || row.STATE || row.STATE_CODE || "").trim();
    const longestRunwayFt = parseFloat(
      row.longest_runway_ft || row.LONGEST_RUNWAY_FT || ""
    );
    const surfaceValue = (
      row.surface_category ||
      row.SURFACE_CATEGORY ||
      ""
    )
      .trim()
      .toLowerCase();
    const toweredValue = (row.towered || row.TOWERED || "").trim().toLowerCase();
    const towered =
      toweredValue === "yes" || toweredValue === "true"
        ? true
        : toweredValue === "no" || toweredValue === "false"
          ? false
          : undefined;
    const surfaceCategory =
      surfaceValue === "paved" ||
      surfaceValue === "unpaved" ||
      surfaceValue === "water" ||
      surfaceValue === "unknown"
        ? (surfaceValue as SurfaceCategory)
        : undefined;

    return [
      {
        id,
        state,
        name: name.trim() || id,
        city: city.trim(),
        county: county.trim(),
        latitude: Number.isFinite(latitude) ? latitude : undefined,
        longitude: Number.isFinite(longitude) ? longitude : undefined,
        towered,
        longestRunwayFt: Number.isFinite(longestRunwayFt)
          ? longestRunwayFt
          : undefined,
        surfaceCategory,
        source: "public",
        type: row.type,
        sources: row.sources,
        corroborated: row.corroborated
      } satisfies Facility
    ];
  });
}

export function parseOurAirports(csvText: string): Facility[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true
  });

  return parsed.data
    .filter((row) => row.iso_region === "US-CA")
    .flatMap((row) => {
      const id = normalizeFacilityId(row.ident || "");
      if (!id) return [];

      const latitude = parseFloat(row.latitude_deg || "");
      const longitude = parseFloat(row.longitude_deg || "");

      return [
        {
          id,
          name: (row.name || id).trim(),
          city: (row.municipality || "").trim(),
          county: "",
          latitude: Number.isFinite(latitude) ? latitude : undefined,
          longitude: Number.isFinite(longitude) ? longitude : undefined,
          source: "ourairports",
          type: row.type
        } satisfies Facility
      ];
    });
}
