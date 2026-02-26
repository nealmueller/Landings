import { describe, expect, it } from "vitest";
import { parseForeFlightCsv } from "@/lib/foreflight";

const sampleCsv = [
  "Aircraft Table",
  "Tail Number,Type",
  "N12345,C172",
  "",
  "Flights Table",
  "Date,From,To,Route,Remarks",
  "2024-01-02,KSFO,KLAX,SFO V23 LAX,Touch and go",
  "2024-01-03,KOAK,KSQL,",
  "",
  "Totals Table",
  "Total Time,10"
].join("\n");

describe("parseForeFlightCsv", () => {
  it("finds the flights table inside a multi-table export", () => {
    const result = parseForeFlightCsv(sampleCsv);
    expect(result.error).toBeUndefined();
    expect(result.flights).toHaveLength(2);
    expect(result.flights[0].from).toBe("KSFO");
    expect(result.flights[0].to).toBe("KLAX");
    expect(result.flights[0].textFields.join(" ")).toContain("SFO");
  });

  it("returns an error when flights table is missing", () => {
    const result = parseForeFlightCsv("Header,Only\n1,2");
    expect(result.error).toBe("No Flights Table found.");
  });

  it("accepts common header aliases for origin/destination", () => {
    const aliasCsv = [
      "Flights Table",
      "Flight Date,Origin,Destination,Remarks",
      "2024-01-05,KSFO,KSQL,Test"
    ].join("\n");

    const result = parseForeFlightCsv(aliasCsv);
    expect(result.error).toBeUndefined();
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0].from).toBe("KSFO");
    expect(result.flights[0].to).toBe("KSQL");
  });
});
