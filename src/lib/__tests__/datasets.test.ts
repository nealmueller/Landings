import { describe, expect, it } from "vitest";
import { parseFacilitiesMaster } from "@/lib/datasets";

describe("parseFacilitiesMaster", () => {
  it("parses towered, runway, and surface fields", () => {
    const csv = [
      "id,state,name,city,county,latitude,longitude,towered,longest_runway_ft,surface_category,type,sources,corroborated",
      "KABC,CA,Test Field,Somewhere,Test,37.5,-122.2,yes,5200,paved,airport,faa,no",
      "1CA,CA,Grass Strip,Elsewhere,Test,36.2,-121.1,no,1800,unpaved,airport,faa,no"
    ].join("\n");

    const facilities = parseFacilitiesMaster(csv);
    expect(facilities).toHaveLength(2);

    expect(facilities[0]).toMatchObject({
      id: "ABC",
      towered: true,
      longestRunwayFt: 5200,
      surfaceCategory: "paved"
    });

    expect(facilities[1]).toMatchObject({
      id: "1CA",
      towered: false,
      longestRunwayFt: 1800,
      surfaceCategory: "unpaved"
    });
  });
});
