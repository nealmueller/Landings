import { normalizeFacilityId, isCoordinateToken, tokenizeText } from "@/lib/normalize";
import type { Facility } from "@/lib/datasets";
import type { FlightRow } from "@/lib/foreflight";

export type Scope = "public" | "private" | "heliport" | "seaplane" | "all";
export type SourceType = "endpoint_from" | "endpoint_to" | "notes_match";

export type FacilityMatch = {
  id: string;
  counts: Record<SourceType, number>;
};

const BRAVO_EXCLUSIONS = new Set(["SFO", "LAX", "SAN"]);
const COORDINATE_ENDPOINT_MAX_DISTANCE_NM = 10;

const PRIVATE_TYPES = new Set([
  "small_airport",
  "medium_airport",
  "large_airport"
]);

type CoordinatePoint = {
  latitude: number;
  longitude: number;
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceNm(from: CoordinatePoint, to: CoordinatePoint): number {
  const radiusNm = 3440.065;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusNm * c;
}

function parseCoordinateEndpoint(value: string): CoordinatePoint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hemiMatch = trimmed.match(
    /^(\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])\s*[/,]\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])$/i
  );
  if (hemiMatch) {
    const latMag = Number(hemiMatch[1]);
    const latHemi = hemiMatch[2].toUpperCase();
    const lonMag = Number(hemiMatch[3]);
    const lonHemi = hemiMatch[4].toUpperCase();
    if (!Number.isFinite(latMag) || !Number.isFinite(lonMag)) return null;
    const latitude = latHemi === "S" ? -latMag : latMag;
    const longitude = lonHemi === "W" ? -lonMag : lonMag;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
  }

  const signedMatch = trimmed.match(
    /^([-+]?\d{1,2}(?:\.\d+)?)\s*[,/]\s*([-+]?\d{1,3}(?:\.\d+)?)$/
  );
  if (signedMatch) {
    const latitude = Number(signedMatch[1]);
    const longitude = Number(signedMatch[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
  }

  return null;
}

export function applyBravoExclusion(ids: Set<string>, enabled: boolean): Set<string> {
  if (!enabled) return ids;
  const filtered = new Set(ids);
  BRAVO_EXCLUSIONS.forEach((id) => filtered.delete(id));
  return filtered;
}

export function buildScopeFacilities(
  scope: Scope,
  publicFacilities: Facility[],
  ourFacilities: Facility[],
  bravoExcluded: boolean
): Facility[] {
  const publicIds = new Set(publicFacilities.map((facility) => facility.id));

  const publicList = publicFacilities.map((facility) => ({ ...facility }));
  const privateList = ourFacilities.filter(
    (facility) =>
      facility.type &&
      PRIVATE_TYPES.has(facility.type) &&
      !publicIds.has(facility.id)
  );
  const heliports = ourFacilities.filter((facility) => facility.type === "heliport");
  const seaplane = ourFacilities.filter(
    (facility) => facility.type === "seaplane_base"
  );

  let combined: Facility[] = [];

  switch (scope) {
    case "public":
      combined = publicList;
      break;
    case "private":
      combined = privateList;
      break;
    case "heliport":
      combined = heliports;
      break;
    case "seaplane":
      combined = seaplane;
      break;
    case "all":
      combined = [...publicList, ...privateList, ...heliports, ...seaplane];
      break;
    default:
      combined = [];
  }

  const deduped = new Map<string, Facility>();
  for (const facility of combined) {
    if (bravoExcluded && BRAVO_EXCLUSIONS.has(facility.id)) {
      continue;
    }
    if (!deduped.has(facility.id)) {
      deduped.set(facility.id, facility);
      continue;
    }

    const existing = deduped.get(facility.id)!;
    if (!existing.latitude && facility.latitude) {
      deduped.set(facility.id, { ...existing, ...facility });
    }
  }

  return Array.from(deduped.values());
}

export function enrichPublicFacilities(
  publicFacilities: Facility[],
  ourFacilities: Facility[]
): Facility[] {
  const ourMap = new Map(ourFacilities.map((facility) => [facility.id, facility]));
  return publicFacilities.map((facility) => {
    const match = ourMap.get(facility.id);
    if (!match) return facility;

    return {
      ...facility,
      latitude: facility.latitude ?? match.latitude,
      longitude: facility.longitude ?? match.longitude,
      name: facility.name || match.name,
      city: facility.city || match.city
    };
  });
}

export function computeFacilityMatches(
  flights: FlightRow[],
  facilityIds: Set<string>,
  facilitiesById?: Map<string, Facility>
): Map<string, FacilityMatch> {
  const matches = new Map<string, FacilityMatch>();
  const coordinateCandidates = facilitiesById
    ? Array.from(facilitiesById.values()).filter(
        (facility) =>
          facilityIds.has(facility.id) &&
          facility.latitude !== undefined &&
          facility.longitude !== undefined
      )
    : [];

  const addMatch = (id: string, source: SourceType) => {
    if (!facilityIds.has(id)) return;
    const entry = matches.get(id) || {
      id,
      counts: { endpoint_from: 0, endpoint_to: 0, notes_match: 0 }
    };
    entry.counts[source] += 1;
    matches.set(id, entry);
  };

  const addCoordinateEndpointMatch = (value: string, source: SourceType) => {
    if (coordinateCandidates.length === 0) return;
    const coordinate = parseCoordinateEndpoint(value);
    if (!coordinate) return;

    let nearestId: string | null = null;
    let nearestDistance = Infinity;

    for (const facility of coordinateCandidates) {
      const distance = distanceNm(coordinate, {
        latitude: facility.latitude!,
        longitude: facility.longitude!
      });
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = facility.id;
      }
    }

    if (
      nearestId &&
      Number.isFinite(nearestDistance) &&
      nearestDistance <= COORDINATE_ENDPOINT_MAX_DISTANCE_NM
    ) {
      addMatch(nearestId, source);
    }
  };

  for (const flight of flights) {
    const rawFrom = flight.from || "";
    const from = normalizeFacilityId(rawFrom);
    const fromMatched = Boolean(from && facilityIds.has(from));
    if (from) addMatch(from, "endpoint_from");
    if (!fromMatched) {
      addCoordinateEndpointMatch(rawFrom, "endpoint_from");
    }

    const rawTo = flight.to || "";
    const to = normalizeFacilityId(rawTo);
    const toMatched = Boolean(to && facilityIds.has(to));
    if (to) addMatch(to, "endpoint_to");
    if (!toMatched) {
      addCoordinateEndpointMatch(rawTo, "endpoint_to");
    }

    for (const field of flight.textFields) {
      const tokens = tokenizeText(field);
      for (const token of tokens) {
        if (isCoordinateToken(token)) continue;
        const normalized = normalizeFacilityId(token);
        if (normalized) addMatch(normalized, "notes_match");
      }
    }
  }

  return matches;
}

export function computeVisitedSet(
  matches: Map<string, FacilityMatch>,
  options: {
    includeNotes: boolean;
    useEndpoints: boolean;
    arrivalsOnly: boolean;
  }
): Set<string> {
  const visited = new Set<string>();
  for (const [id, match] of matches) {
    let count = 0;
    if (options.useEndpoints) {
      if (options.arrivalsOnly) {
        count += match.counts.endpoint_to;
      } else {
        count += match.counts.endpoint_to + match.counts.endpoint_from;
      }
    }
    if (options.includeNotes) {
      count += match.counts.notes_match;
    }
    if (count > 0) visited.add(id);
  }
  return visited;
}

export function computeFrequency(
  matches: Map<string, FacilityMatch>,
  options: {
    includeNotes: boolean;
    useEndpoints: boolean;
    arrivalsOnly: boolean;
  }
): Map<string, { total: number; counts: Record<SourceType, number> }> {
  const totals = new Map<string, { total: number; counts: Record<SourceType, number> }>();

  for (const [id, match] of matches) {
    const counts = { ...match.counts };
    let total = 0;

    if (options.useEndpoints) {
      if (options.arrivalsOnly) {
        total += counts.endpoint_to;
      } else {
        total += counts.endpoint_from + counts.endpoint_to;
      }
    }

    if (!options.useEndpoints) {
      counts.endpoint_from = 0;
      counts.endpoint_to = 0;
    } else if (options.arrivalsOnly) {
      counts.endpoint_from = 0;
    }

    if (options.includeNotes) {
      total += counts.notes_match;
    } else {
      counts.notes_match = 0;
    }

    totals.set(id, { total, counts });
  }

  return totals;
}
