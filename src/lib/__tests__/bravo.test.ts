import { describe, expect, it } from "vitest";
import { buildScopeFacilities } from "@/lib/coverage";
import type { Facility } from "@/lib/datasets";

describe("bravo exclusion", () => {
  it("removes SFO, LAX, SAN from denominators", () => {
    const publicFacilities: Facility[] = [
      {
        id: "SFO",
        name: "San Francisco Intl",
        city: "San Francisco",
        county: "",
        source: "public"
      },
      {
        id: "OAK",
        name: "Oakland Intl",
        city: "Oakland",
        county: "",
        source: "public"
      }
    ];

    const facilities = buildScopeFacilities(
      "public",
      publicFacilities,
      [],
      true
    );

    const ids = facilities.map((facility) => facility.id);
    expect(ids).toEqual(["OAK"]);
  });
});
