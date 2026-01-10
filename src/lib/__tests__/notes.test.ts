import { describe, expect, it } from "vitest";
import { computeFacilityMatches } from "@/lib/coverage";
import type { FlightRow } from "@/lib/foreflight";

describe("notes matching", () => {
  it("matches tokens from notes against the facility set", () => {
    const flights: FlightRow[] = [
      {
        date: "2024-01-01",
        from: "L54",
        to: "L35",
        textFields: ["Touched KMOD then 37.5N/122.2W"]
      }
    ];

    const matches = computeFacilityMatches(
      flights,
      new Set(["L54", "L35", "MOD"])
    );

    expect(matches.get("MOD")?.counts.notes_match).toBe(1);
    expect(matches.get("L54")?.counts.endpoint_from).toBe(1);
    expect(matches.get("L35")?.counts.endpoint_to).toBe(1);
    expect(matches.has("122.2W")).toBe(false);
  });
});
