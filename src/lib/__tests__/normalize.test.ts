import { describe, expect, it } from "vitest";
import { normalizeFacilityId, isCoordinateToken } from "@/lib/normalize";

describe("normalizeFacilityId", () => {
  it("strips punctuation and uppercases", () => {
    expect(normalizeFacilityId("(lax)")).toBe("LAX");
  });

  it("removes leading K for US ICAO", () => {
    expect(normalizeFacilityId("KSFO")).toBe("SFO");
  });
});

describe("isCoordinateToken", () => {
  it("detects coordinate-like tokens", () => {
    expect(isCoordinateToken("37.5N/122.2W")).toBe(true);
    expect(isCoordinateToken("122.2W")).toBe(true);
  });

  it("does not flag facility IDs", () => {
    expect(isCoordinateToken("L54")).toBe(false);
  });
});
