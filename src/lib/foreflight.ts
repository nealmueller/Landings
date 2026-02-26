import Papa from "papaparse";

export type FlightRow = {
  date: string;
  from: string;
  to: string;
  textFields: string[];
};

export type FlightsParseResult = {
  flights: FlightRow[];
  error?: string;
};

const HEADER_TERMINATOR = /Table\s*$/i;
const DATE_HEADER_ALIASES = ["date", "flightdate"];
const FROM_HEADER_ALIASES = [
  "from",
  "origin",
  "departure",
  "fromairport",
  "departureairport"
];
const TO_HEADER_ALIASES = ["to", "destination", "arrival", "toairport", "arrivalairport"];
const TEXT_HEADER_HINTS = [
  "notes",
  "remarks",
  "route",
  "comment",
  "via",
  "approach",
  "procedure"
];

function normalizeHeaderCell(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isRowEmpty(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

function isSectionHeader(row: string[]): boolean {
  if (row.length === 0) return false;
  const first = row[0]?.trim();
  if (!first) return false;
  return HEADER_TERMINATOR.test(first);
}

function findFlightsHeaderIndex(rows: string[][]): number {
  return rows.findIndex((row) => {
    const normalized = row.map(normalizeHeaderCell);
    const hasDate = DATE_HEADER_ALIASES.some((header) => normalized.includes(header));
    const hasFrom = FROM_HEADER_ALIASES.some((header) => normalized.includes(header));
    const hasTo = TO_HEADER_ALIASES.some((header) => normalized.includes(header));
    return hasDate && hasFrom && hasTo;
  });
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.findIndex((header) => header === alias);
    if (index !== -1) return index;
  }
  return -1;
}

function findTextColumns(headers: string[]): number[] {
  return headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) =>
      TEXT_HEADER_HINTS.some((hint) => header.includes(hint))
    )
    .map(({ index }) => index);
}

function extractTextFields(row: string[], textIndexes: number[]): string[] {
  return textIndexes
    .map((index) => row[index] ?? "")
    .filter((value) => value.trim().length > 0);
}

export function parseForeFlightCsv(csvText: string): FlightsParseResult {
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });
  if (parsed.errors.length > 0) {
    return { flights: [], error: parsed.errors[0]?.message || "CSV parse error" };
  }

  const rows = parsed.data.filter((row) => row.length > 0);
  const headerIndex = findFlightsHeaderIndex(rows);
  if (headerIndex === -1) {
    return { flights: [], error: "No Flights Table found." };
  }

  const headerRow = rows[headerIndex].map(normalizeHeaderCell);
  const fromIndex = findColumnIndex(headerRow, FROM_HEADER_ALIASES);
  const toIndex = findColumnIndex(headerRow, TO_HEADER_ALIASES);
  const dateIndex = findColumnIndex(headerRow, DATE_HEADER_ALIASES);
  if (fromIndex === -1 || toIndex === -1 || dateIndex === -1) {
    return { flights: [], error: "No Flights Table found." };
  }
  const textIndexes = findTextColumns(headerRow);

  const flights: FlightRow[] = [];
  let emptyRun = 0;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];

    if (isSectionHeader(row)) break;
    if (isRowEmpty(row)) {
      emptyRun += 1;
      if (emptyRun >= 3) break;
      continue;
    }

    emptyRun = 0;
    const from = row[fromIndex] ?? "";
    const to = row[toIndex] ?? "";
    const date = row[dateIndex] ?? "";
    const textFields = extractTextFields(row, textIndexes);

    flights.push({ date, from, to, textFields });
  }

  return { flights };
}
