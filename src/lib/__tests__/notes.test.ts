import { describe, expect, it } from "vitest";
import { computeFacilityMatches } from "@/lib/coverage";
import type { FlightRow } from "@/lib/foreflight";
import type { Facility } from "@/lib/datasets";

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

  it("maps coordinate endpoints to the nearest known airport", () => {
    const flights: FlightRow[] = [
      {
        date: "2024-01-01",
        from: "37.6188056°N/122.3754167°W",
        to: "KSQL",
        textFields: []
      }
    ];
    const facilities = new Map<string, Facility>([
      [
        "SFO",
        {
          id: "SFO",
          name: "San Francisco Intl",
          city: "San Francisco",
          county: "San Mateo",
          latitude: 37.6188056,
          longitude: -122.3754167,
          source: "public"
        }
      ],
      [
        "SQL",
        {
          id: "SQL",
          name: "San Carlos",
          city: "San Carlos",
          county: "San Mateo",
          latitude: 37.5119,
          longitude: -122.2495,
          source: "public"
        }
      ]
    ]);

    const matches = computeFacilityMatches(
      flights,
      new Set(["SFO", "SQL"]),
      facilities
    );

    expect(matches.get("SFO")?.counts.endpoint_from).toBe(1);
    expect(matches.get("SQL")?.counts.endpoint_to).toBe(1);
  });
});
