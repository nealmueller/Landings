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
const REQUIRED_HEADERS = ["date", "from", "to"];
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
  return value.trim().toLowerCase();
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
    return REQUIRED_HEADERS.every((header) => normalized.includes(header));
  });
}

function findColumnIndex(headers: string[], key: string): number {
  return headers.findIndex((header) => header === key);
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
  const fromIndex = findColumnIndex(headerRow, "from");
  const toIndex = findColumnIndex(headerRow, "to");
  const dateIndex = findColumnIndex(headerRow, "date");
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
