"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
  buildScopeFacilities,
  computeFacilityMatches,
  computeVisitedSet,
  type Scope
} from "@/lib/coverage";
import { parseFacilitiesMaster, type Facility } from "@/lib/datasets";
import { parseForeFlightCsv, type FlightRow } from "@/lib/foreflight";
import {
  loadDotRadius,
  loadHomeBase,
  loadMapFilter,
  loadSavedCsv,
  loadSelectedState,
  hasLocalSettings,
  hasSelectedState,
  saveHomeBase,
  saveMapFilter,
  saveDotRadius,
  saveSelectedState,
  saveSavedCsv,
  clearAllLocalData
} from "@/lib/localData";
import {
  isCoordinateToken,
  normalizeFacilityId,
  tokenizeText
} from "@/lib/normalize";

const FacilityMap = dynamic(() => import("@/components/FacilityMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[100svh] w-full rounded-3xl border border-ink/10 bg-white shadow-card" />
  )
});

const mapSortOptions = [
  { value: "id", label: "Airport ID" },
  { value: "name", label: "Name" },
  { value: "city", label: "City" }
] as const;

const DOT_RADIUS_MIN = 4;
const DOT_RADIUS_MAX = 16;
const DEFAULT_DOT_RADIUS = 10;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 200;
const TRIP_PAGE_SIZE = 25;
const TRIP_DISTANCE_MIN = 25;
const TRIP_DISTANCE_MAX = 1000;
const TRIP_DISTANCE_DEFAULT = 250;

const STATE_OPTIONS = [
  { code: "CONUS", name: "Contiguous US" },
  { code: "US", name: "United States" },
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" }
];

const CONTIGUOUS_STATE_CODES = new Set(
  STATE_OPTIONS.map((state) => state.code).filter((code) =>
    !["US", "CONUS", "AK", "HI"].includes(code)
  )
);

type SortKey = (typeof mapSortOptions)[number]["value"];
type UnvisitedSortKey = SortKey | "distance";
type TripSurfaceFilter = "any" | "paved" | "unpaved" | "water";
type TripTowerFilter = "any" | "towered" | "nontowered";

const sortAccessors: Record<SortKey, (facility: Facility) => string> = {
  id: (facility) => facility.id,
  name: (facility) => facility.name,
  city: (facility) => facility.city
};

const unvisitedSortOptions = [
  ...mapSortOptions,
  { value: "distance", label: "Distance from home" }
] as const;

const tripSurfaceOptions: Array<{ value: TripSurfaceFilter; label: string }> = [
  { value: "any", label: "Any surface" },
  { value: "paved", label: "Paved only" },
  { value: "unpaved", label: "Unpaved only" },
  { value: "water", label: "Water only" }
];

const tripTowerOptions: Array<{ value: TripTowerFilter; label: string }> = [
  { value: "any", label: "Any tower status" },
  { value: "towered", label: "Towered only" },
  { value: "nontowered", label: "Non-towered only" }
];

const tripRunwayOptions = [
  { value: 0, label: "Any runway length" },
  { value: 800, label: "800+ ft" },
  { value: 1000, label: "1,000+ ft" },
  { value: 1200, label: "1,200+ ft" },
  { value: 1500, label: "1,500+ ft" },
  { value: 2000, label: "2,000+ ft" },
  { value: 2500, label: "2,500+ ft" },
  { value: 3500, label: "3,500+ ft" }
] as const;

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function parseFlightDate(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function formatDateLabel(value: number | null) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleDateString();
}

function formatSurfaceLabel(value?: string) {
  if (value === "paved") return "Paved";
  if (value === "unpaved") return "Unpaved";
  if (value === "water") return "Water";
  return "Unknown";
}

function getPlannedRunwayFt(lengthFt?: number): number | undefined {
  if (!lengthFt || !Number.isFinite(lengthFt)) return undefined;
  return Math.max(0, Math.round(lengthFt * 0.75));
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

function sortFacilities(list: Facility[], sortKey: SortKey) {
  const accessor = sortAccessors[sortKey];
  return [...list].sort((a, b) =>
    accessor(a).localeCompare(accessor(b))
  );
}

function getStateName(code: string) {
  return STATE_OPTIONS.find((state) => state.code === code)?.name || code;
}

function getFacilitiesBounds(facilities: Facility[]) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  facilities.forEach((facility) => {
    if (facility.latitude === undefined || facility.longitude === undefined) {
      return;
    }
    minLat = Math.min(minLat, facility.latitude);
    maxLat = Math.max(maxLat, facility.latitude);
    minLng = Math.min(minLng, facility.longitude);
    maxLng = Math.max(maxLng, facility.longitude);
  });

  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) {
    return null;
  }

  if (minLat === maxLat) {
    minLat -= 0.1;
    maxLat += 0.1;
  }
  if (minLng === maxLng) {
    minLng -= 0.1;
    maxLng += 0.1;
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng]
  ] as [[number, number], [number, number]];
}

function calculateDistanceNm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radiusNm = 3440.065;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusNm * c;
}

function buildLogbookStatus(flights: FlightRow[]) {
  if (flights.length === 0) return null;
  let latest: number | null = null;
  flights.forEach((flight) => {
    const timestamp = parseFlightDate(flight.date);
    if (timestamp === null) return;
    if (latest === null || timestamp > latest) {
      latest = timestamp;
    }
  });
  const dateLabel = formatDateLabel(latest);
  return `Last updated from ForeFlight on ${dateLabel} with ${flights.length} flights.`;
}

function buildDemoLogbook(facilitiesByState: Map<string, Facility[]>): FlightRow[] {
  const states = Array.from(facilitiesByState.keys()).filter(
    (state) => state && !["AK", "HI"].includes(state)
  );
  if (states.length === 0) return [];
  const shuffledStates = states.sort(() => Math.random() - 0.5);
  const sampleStates = shuffledStates.slice(0, 6);
  const homeState = sampleStates[0];
  const homeFacilities = facilitiesByState.get(homeState) || [];
  const homeBase = homeFacilities[Math.floor(Math.random() * homeFacilities.length)];
  const flights: FlightRow[] = [];
  const now = new Date();

  for (let i = 0; i < 140; i += 1) {
    const state = sampleStates[i % sampleStates.length];
    const facilities = facilitiesByState.get(state) || [];
    if (facilities.length === 0) continue;
    const toFacility =
      facilities[Math.floor(Math.random() * facilities.length)];
    const fromFacility =
      Math.random() < 0.6 && homeBase ? homeBase : toFacility;
    const offsetDays = 3 + Math.floor(Math.random() * 6);
    now.setDate(now.getDate() - offsetDays);
    flights.push({
      date: now.toISOString().slice(0, 10),
      from: fromFacility?.id || toFacility.id,
      to: toFacility.id,
      textFields: []
    });
  }

  return flights;
}

export default function LandingsApp() {
  const [publicFacilities, setPublicFacilities] = useState<Facility[]>([]);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [logbookStatus, setLogbookStatus] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [hasSavedCsv, setHasSavedCsv] = useState(false);
  const [isFreshVisit, setIsFreshVisit] = useState<boolean | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [visitedSearch, setVisitedSearch] = useState("");
  const [unvisitedSearch, setUnvisitedSearch] = useState("");
  const [visitedSort, setVisitedSort] = useState<SortKey>("id");
  const [unvisitedSort, setUnvisitedSort] = useState<UnvisitedSortKey>("id");
  const [dotRadius, setDotRadius] = useState(DEFAULT_DOT_RADIUS);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedState, setSelectedState] = useState("CONUS");
  const [manualStateSelection, setManualStateSelection] = useState(false);
  const [mapFilter, setMapFilter] = useState<"all" | "visited" | "unvisited">(
    "all"
  );
  const [isMapUpdating, setIsMapUpdating] = useState(false);
  const [homeBaseId, setHomeBaseId] = useState<string | null>(null);
  const [tripMaxDistanceNm, setTripMaxDistanceNm] = useState(
    TRIP_DISTANCE_DEFAULT
  );
  const [tripMinRunwayFt, setTripMinRunwayFt] = useState(800);
  const [tripSurfaceFilter, setTripSurfaceFilter] =
    useState<TripSurfaceFilter>("paved");
  const [tripTowerFilter, setTripTowerFilter] =
    useState<TripTowerFilter>("any");
  const [tripPage, setTripPage] = useState(0);
  const [visitedPage, setVisitedPage] = useState(0);
  const [unvisitedPage, setUnvisitedPage] = useState(0);
  const [mostVisitedSort, setMostVisitedSort] = useState<{
    key: "id" | "name" | "location" | "count" | "lastVisited";
    direction: "asc" | "desc";
  }>({ key: "count", direction: "desc" });
  const [sourceList, setSourceList] = useState<
    Array<{
      name: string;
      file: string;
      deduped: string;
      corroborated: string;
      updated: string;
      total?: number;
    }>
  >([]);
  const radiusHydratedRef = useRef(false);
  const stateHydratedRef = useRef(false);
  const homeBaseHydratedRef = useRef(false);
  const demoLoadedRef = useRef(false);

  const debouncedVisitedSearch = useDebouncedValue(
    visitedSearch,
    SEARCH_DEBOUNCE_MS
  );
  const debouncedUnvisitedSearch = useDebouncedValue(
    unvisitedSearch,
    SEARCH_DEBOUNCE_MS
  );

  useEffect(() => {
    let isMounted = true;
    fetch("/data/us/facilities_master.csv")
      .then((response) => response.text())
      .then((text) => {
        if (!isMounted) return;
        const facilities = parseFacilitiesMaster(text);
        setPublicFacilities(facilities);
      })
      .catch(() => {
        if (!isMounted) return;
        setPublicError("Could not load built-in airports list.");
      });

    fetch("/data/us/sources.json")
      .then((response) => response.json())
      .then((data) => {
        if (!isMounted) return;
        setSourceList(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!isMounted) return;
        setSourceList([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const storedRadius = loadDotRadius(DEFAULT_DOT_RADIUS);
    const clamped = Math.min(
      DOT_RADIUS_MAX,
      Math.max(DOT_RADIUS_MIN, storedRadius)
    );
    setDotRadius(clamped);
    radiusHydratedRef.current = true;
  }, []);

  useEffect(() => {
    setIsFreshVisit(!hasLocalSettings());
  }, []);

  useEffect(() => {
    if (!radiusHydratedRef.current) return;
    saveDotRadius(dotRadius);
  }, [dotRadius]);

  useEffect(() => {
    const storedState = loadSelectedState("CONUS");
    setSelectedState(storedState);
    setManualStateSelection(hasSelectedState());
    stateHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!stateHydratedRef.current) return;
    saveSelectedState(selectedState);
  }, [selectedState]);

  useEffect(() => {
    const storedHomeBase = loadHomeBase(null);
    setHomeBaseId(storedHomeBase);
    homeBaseHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!homeBaseHydratedRef.current) return;
    saveHomeBase(homeBaseId);
  }, [homeBaseId]);

  useEffect(() => {
    const storedFilter = loadMapFilter("all");
    if (storedFilter === "visited" || storedFilter === "unvisited") {
      setMapFilter(storedFilter);
    }
  }, []);

  useEffect(() => {
    saveMapFilter(mapFilter);
  }, [mapFilter]);

  useEffect(() => {
    let isMounted = true;
    const restoreSavedCsv = async () => {
      const saved = await loadSavedCsv();
      if (!saved || !isMounted) {
        if (isMounted) {
          setHasSavedCsv(false);
        }
        return;
      }
      const result = parseForeFlightCsv(saved.csvText);
      if (!isMounted) return;
      setFlights(result.flights);
      setFlightError(result.error || null);
      setLogbookStatus(buildLogbookStatus(result.flights));
      setIsDemo(false);
      setHasSavedCsv(true);
    };
    restoreSavedCsv();
    return () => {
      isMounted = false;
    };
  }, []);

  const scope: Scope = "public";

  const scopeFacilities = useMemo(
    () => buildScopeFacilities(scope, publicFacilities, [], false),
    [scope, publicFacilities]
  );

  const facilitiesByState = useMemo(() => {
    const grouped = new Map<string, Facility[]>();
    scopeFacilities.forEach((facility) => {
      const state = facility.state || "";
      if (!state) return;
      const list = grouped.get(state) || [];
      list.push(facility);
      grouped.set(state, list);
    });
    return grouped;
  }, [scopeFacilities]);

  const hasFlights = flights.length > 0;
  const hasRealLogbook = hasFlights && !isDemo;


  useEffect(() => {
    if (demoLoadedRef.current) return;
    if (hasSavedCsv) return;
    if (isFreshVisit !== true) return;
    setFlights([]);
    setFlightError(null);
    setIsDemo(false);
    setLogbookStatus(null);
    demoLoadedRef.current = true;
  }, [hasSavedCsv, isFreshVisit]);

  useEffect(() => {
    setIsMapUpdating(true);
    const timeout = window.setTimeout(() => setIsMapUpdating(false), 350);
    return () => window.clearTimeout(timeout);
  }, [mapFilter, selectedState, flights.length]);

  const selectedFacilities = useMemo(() => {
    if (selectedState === "US") return scopeFacilities;
    if (selectedState === "CONUS") {
      return scopeFacilities.filter((facility) =>
        facility.state ? CONTIGUOUS_STATE_CODES.has(facility.state) : false
      );
    }
    return facilitiesByState.get(selectedState) || [];
  }, [facilitiesByState, scopeFacilities, selectedState]);

  const scopeLabel = useMemo(() => getStateName(selectedState), [selectedState]);

  const mapBounds = useMemo(() => {
    if (selectedState === "US" || selectedState === "CONUS") {
      const contiguous = scopeFacilities.filter((facility) =>
        facility.state ? CONTIGUOUS_STATE_CODES.has(facility.state) : false
      );
      return getFacilitiesBounds(contiguous);
    }
    return getFacilitiesBounds(selectedFacilities);
  }, [selectedFacilities, scopeFacilities, selectedState]);

  const facilityIds = useMemo(
    () => new Set(scopeFacilities.map((facility) => facility.id)),
    [scopeFacilities]
  );

  const facilityById = useMemo(
    () => new Map(scopeFacilities.map((facility) => [facility.id, facility])),
    [scopeFacilities]
  );

  const visitStats = useMemo(() => {
    const stats = new Map<
      string,
      { count: number; lastVisited: number | null; firstVisited: number | null }
    >();

    const addVisit = (id: string, timestamp: number | null) => {
      if (!facilityIds.has(id)) return;
      const entry = stats.get(id) || {
        count: 0,
        lastVisited: null,
        firstVisited: null
      };
      entry.count += 1;
      if (timestamp !== null) {
        if (entry.lastVisited === null || timestamp > entry.lastVisited) {
          entry.lastVisited = timestamp;
        }
        if (entry.firstVisited === null || timestamp < entry.firstVisited) {
          entry.firstVisited = timestamp;
        }
      }
      stats.set(id, entry);
    };

    flights.forEach((flight) => {
      const timestamp = parseFlightDate(flight.date);
      const from = normalizeFacilityId(flight.from || "");
      if (from) addVisit(from, timestamp);
      const to = normalizeFacilityId(flight.to || "");
      if (to) addVisit(to, timestamp);
      flight.textFields.forEach((field) => {
        const tokens = tokenizeText(field);
        tokens.forEach((token) => {
          if (isCoordinateToken(token)) return;
          const normalized = normalizeFacilityId(token);
          if (normalized) addVisit(normalized, timestamp);
        });
      });
    });

    return stats;
  }, [facilityIds, flights]);

  const homeBaseOptions = useMemo(() => {
    const options: Array<{
      id: string;
      name: string;
      count: number;
      facility: Facility;
    }> = [];
    visitStats.forEach((stats, id) => {
      if (stats.count === 0) return;
      const facility = facilityById.get(id);
      if (!facility) return;
      options.push({
        id,
        name: facility.name,
        count: stats.count,
        facility
      });
    });
    return options.sort((a, b) => b.count - a.count);
  }, [facilityById, visitStats]);

  useEffect(() => {
    if (homeBaseOptions.length === 0) {
      if (homeBaseId) setHomeBaseId(null);
      return;
    }
    if (homeBaseId && homeBaseOptions.some((option) => option.id === homeBaseId)) {
      return;
    }
    setHomeBaseId(homeBaseOptions[0].id);
  }, [homeBaseId, homeBaseOptions]);

  const homeBaseFacility = useMemo(() => {
    if (!homeBaseId) return null;
    return facilityById.get(homeBaseId) || null;
  }, [facilityById, homeBaseId]);

  const matches = useMemo(
    () => computeFacilityMatches(flights, facilityIds, facilityById),
    [flights, facilityById, facilityIds]
  );

  const visitedSet = useMemo(
    () =>
      computeVisitedSet(matches, {
        includeNotes: true,
        useEndpoints: true,
        arrivalsOnly: false
      }),
    [matches]
  );

  const scopeFilteredFacilities = useMemo(() => {
    if (mapFilter === "visited") {
      return selectedFacilities.filter((facility) => visitedSet.has(facility.id));
    }
    if (mapFilter === "unvisited") {
      return selectedFacilities.filter((facility) => !visitedSet.has(facility.id));
    }
    return selectedFacilities;
  }, [mapFilter, selectedFacilities, visitedSet]);

  const unvisitedInScope = useMemo(
    () => selectedFacilities.filter((facility) => !visitedSet.has(facility.id)),
    [selectedFacilities, visitedSet]
  );

  const visitedFacilities = useMemo(
    () => scopeFilteredFacilities.filter((facility) => visitedSet.has(facility.id)),
    [scopeFilteredFacilities, visitedSet]
  );

  const unvisitedFacilities = useMemo(
    () =>
      scopeFilteredFacilities.filter((facility) => !visitedSet.has(facility.id)),
    [scopeFilteredFacilities, visitedSet]
  );

  const coverage = useMemo(() => {
    const total = selectedFacilities.length;
    const visited = visitedFacilities.length;
    const ratio = total > 0 ? visited / total : 0;
    return { total, visited, ratio };
  }, [selectedFacilities, visitedFacilities]);

  const coverageByState = useMemo(() => {
    const results = new Map<string, { total: number; visited: number; ratio: number }>();
    facilitiesByState.forEach((facilities, state) => {
      const total = facilities.length;
      const visited = facilities.filter((facility) => visitedSet.has(facility.id)).length;
      const ratio = total > 0 ? visited / total : 0;
      results.set(state, { total, visited, ratio });
    });
    return results;
  }, [facilitiesByState, visitedSet]);

  const mostVisitedState = useMemo(() => {
    const totals = new Map<string, number>();
    visitStats.forEach((stats, id) => {
      const facility = facilityById.get(id);
      const state = facility?.state;
      if (!state) return;
      totals.set(state, (totals.get(state) || 0) + stats.count);
    });
    let bestState: string | null = null;
    let bestCount = -1;
    totals.forEach((count, state) => {
      if (count > bestCount) {
        bestState = state;
        bestCount = count;
      }
    });
    return bestState ? `${getStateName(bestState)}` : "—";
  }, [facilityById, visitStats]);

  const mostVisitedAirport = useMemo(() => {
    let bestId: string | null = null;
    let bestCount = -1;
    let bestLast = -1;
    selectedFacilities.forEach((facility) => {
      const stats = visitStats.get(facility.id);
      if (!stats) return;
      const last = stats.lastVisited ?? -1;
      if (stats.count > bestCount || (stats.count === bestCount && last > bestLast)) {
        bestId = facility.id;
        bestCount = stats.count;
        bestLast = last;
      }
    });
    if (!bestId) return "—";
    const facility = facilityById.get(bestId);
    return facility ? `${facility.id} (${facility.name})` : bestId;
  }, [facilityById, selectedFacilities, visitStats]);

  const lastNewAirport = useMemo(() => {
    let bestId: string | null = null;
    let latestFirst = -1;
    selectedFacilities.forEach((facility) => {
      const stats = visitStats.get(facility.id);
      if (!stats || stats.firstVisited === null) return;
      if (stats.firstVisited > latestFirst) {
        latestFirst = stats.firstVisited;
        bestId = facility.id;
      }
    });
    if (!bestId) return { label: "—", date: "—" };
    return { label: bestId, date: formatDateLabel(latestFirst) };
  }, [selectedFacilities, visitStats]);

  const statesInLogbook = useMemo(() => {
    const entries: Array<{
      code: string;
      name: string;
      visited: number;
      total: number;
      ratio: number;
    }> = [];
    coverageByState.forEach((value, state) => {
      if (value.visited === 0) return;
      entries.push({
        code: state,
        name: getStateName(state),
        visited: value.visited,
        total: value.total,
        ratio: value.ratio
      });
    });
    return entries.sort((a, b) => {
      if (b.visited !== a.visited) return b.visited - a.visited;
      return a.name.localeCompare(b.name);
    });
  }, [coverageByState]);

  const mostVisitedRows = useMemo(() => {
    const rows = selectedFacilities
      .map((facility) => {
        const stats = visitStats.get(facility.id);
        if (!stats || stats.count === 0) return null;
        return {
          id: facility.id,
          name: facility.name,
          location: facility.city || facility.county || "",
          count: stats.count,
          lastVisited: stats.lastVisited
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      location: string;
      count: number;
      lastVisited: number | null;
    }>;

    const sorted = [...rows].sort((a, b) => {
      const direction = mostVisitedSort.direction === "asc" ? 1 : -1;
      switch (mostVisitedSort.key) {
        case "id":
          return direction * a.id.localeCompare(b.id);
        case "name":
          return direction * a.name.localeCompare(b.name);
        case "location":
          return direction * a.location.localeCompare(b.location);
        case "lastVisited": {
          const aVal = a.lastVisited ?? 0;
          const bVal = b.lastVisited ?? 0;
          return direction * (aVal - bVal);
        }
        case "count":
        default:
          if (a.count !== b.count) return direction * (a.count - b.count);
          return direction * ((a.lastVisited ?? 0) - (b.lastVisited ?? 0));
      }
    });

    return sorted;
  }, [mostVisitedSort.direction, mostVisitedSort.key, selectedFacilities, visitStats]);

  const sourcesSummary = useMemo(() => {
    if (sourceList.length === 0) return "Sources unavailable.";
    return sourceList
      .map((source) => {
        const rows = source.total ? ` Rows: ${source.total}.` : "";
        const file = source.file.split(" (")[0] || source.file;
        return `${source.name} (${file}). Updated: ${source.updated}.${rows}`;
      })
      .join(" ");
  }, [sourceList]);

  const visitedFiltered = useMemo(() => {
    const filtered = visitedFacilities.filter((facility) => {
      const query = debouncedVisitedSearch.trim().toLowerCase();
      if (!query) return true;
      return (
        facility.id.toLowerCase().includes(query) ||
        facility.name.toLowerCase().includes(query) ||
        facility.city.toLowerCase().includes(query) ||
        facility.county.toLowerCase().includes(query)
      );
    });

    return sortFacilities(filtered, visitedSort);
  }, [debouncedVisitedSearch, visitedFacilities, visitedSort]);

  const unvisitedFiltered = useMemo(() => {
    const filtered = unvisitedFacilities.filter((facility) => {
      const query = debouncedUnvisitedSearch.trim().toLowerCase();
      if (!query) return true;
      return (
        facility.id.toLowerCase().includes(query) ||
        facility.name.toLowerCase().includes(query) ||
        facility.city.toLowerCase().includes(query) ||
        facility.county.toLowerCase().includes(query)
      );
    });

    return filtered;
  }, [debouncedUnvisitedSearch, unvisitedFacilities]);

  const unvisitedSorted = useMemo(() => {
    if (unvisitedSort === "distance") {
      const base = homeBaseFacility;
      if (!base || base.latitude === undefined || base.longitude === undefined) {
        return [...unvisitedFiltered];
      }
      const baseLat = base.latitude;
      const baseLng = base.longitude;
      return [...unvisitedFiltered].sort((a, b) => {
        if (a.latitude === undefined || a.longitude === undefined) return 1;
        if (b.latitude === undefined || b.longitude === undefined) return -1;
        const distA = calculateDistanceNm(
          { latitude: baseLat, longitude: baseLng },
          { latitude: a.latitude, longitude: a.longitude }
        );
        const distB = calculateDistanceNm(
          { latitude: baseLat, longitude: baseLng },
          { latitude: b.latitude, longitude: b.longitude }
        );
        return distA - distB;
      });
    }
    return sortFacilities(unvisitedFiltered, unvisitedSort);
  }, [homeBaseFacility, unvisitedFiltered, unvisitedSort]);

  const tripPlannerRows = useMemo(() => {
    if (
      !homeBaseFacility ||
      homeBaseFacility.latitude === undefined ||
      homeBaseFacility.longitude === undefined
    ) {
      return [];
    }

    const base = {
      latitude: homeBaseFacility.latitude,
      longitude: homeBaseFacility.longitude
    };

    return unvisitedInScope
      .flatMap((facility) => {
        if (facility.latitude === undefined || facility.longitude === undefined) {
          return [];
        }
        const distanceNm = calculateDistanceNm(base, {
          latitude: facility.latitude,
          longitude: facility.longitude
        });
        if (distanceNm > tripMaxDistanceNm) return [];
        if (
          tripMinRunwayFt > 0 &&
          (getPlannedRunwayFt(facility.longestRunwayFt) === undefined ||
            getPlannedRunwayFt(facility.longestRunwayFt)! < tripMinRunwayFt)
        ) {
          return [];
        }
        if (
          tripSurfaceFilter !== "any" &&
          facility.surfaceCategory !== tripSurfaceFilter
        ) {
          return [];
        }
        if (tripTowerFilter === "towered" && facility.towered !== true) {
          return [];
        }
        if (tripTowerFilter === "nontowered" && facility.towered === true) {
          return [];
        }
        return [{ facility, distanceNm }];
      })
      .sort((a, b) => {
        if (a.distanceNm !== b.distanceNm) {
          return a.distanceNm - b.distanceNm;
        }
        const aRunway = getPlannedRunwayFt(a.facility.longestRunwayFt) ?? 0;
        const bRunway = getPlannedRunwayFt(b.facility.longestRunwayFt) ?? 0;
        if (aRunway !== bRunway) return bRunway - aRunway;
        return a.facility.id.localeCompare(b.facility.id);
      });
  }, [
    homeBaseFacility,
    tripMaxDistanceNm,
    tripMinRunwayFt,
    tripSurfaceFilter,
    tripTowerFilter,
    unvisitedInScope
  ]);

  const visitedPageCount = Math.max(
    1,
    Math.ceil(visitedFiltered.length / PAGE_SIZE)
  );
  const unvisitedPageCount = Math.max(
    1,
    Math.ceil(unvisitedSorted.length / PAGE_SIZE)
  );
  const tripPageCount = Math.max(1, Math.ceil(tripPlannerRows.length / TRIP_PAGE_SIZE));
  const visitedPageItems = visitedFiltered.slice(
    visitedPage * PAGE_SIZE,
    visitedPage * PAGE_SIZE + PAGE_SIZE
  );
  const tripPageItems = tripPlannerRows.slice(
    tripPage * TRIP_PAGE_SIZE,
    tripPage * TRIP_PAGE_SIZE + TRIP_PAGE_SIZE
  );
  const unvisitedPageItems = unvisitedSorted.slice(
    unvisitedPage * PAGE_SIZE,
    unvisitedPage * PAGE_SIZE + PAGE_SIZE
  );

  useEffect(() => {
    if (!hasFlights || manualStateSelection) return;
    let bestState = "US";
    let bestRatio = -1;
    coverageByState.forEach((value, state) => {
      if (value.total === 0 || value.visited === 0) return;
      if (value.ratio > bestRatio) {
        bestRatio = value.ratio;
        bestState = state;
      }
    });
    if (bestState !== "US") {
      setSelectedState(bestState);
    }
  }, [coverageByState, hasFlights, manualStateSelection]);

  const handleForeFlightFile = async (file: File) => {
    setIsParsing(true);
    setUploadError(null);
    setParseError(null);
    setFlightError(null);
    try {
      const text = await file.text();
      const result = parseForeFlightCsv(text);
      if (result.error || result.flights.length === 0) {
        setParseError(
          "Could not parse this CSV. Check that it is a ForeFlight logbook CSV and try again."
        );
        return;
      }
      await saveSavedCsv(text);
      setFlights(result.flights);
      setFlightError(null);
      setLogbookStatus(buildLogbookStatus(result.flights));
      setIsDemo(false);
      setIsFreshVisit(false);
      setSelectedState("CONUS");
      setManualStateSelection(false);
      setHasSavedCsv(true);
    } finally {
      setIsParsing(false);
    }
  };

  const handleForeFlightUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const isCsv =
      file.name.toLowerCase().endsWith(".csv") ||
      file.type.toLowerCase().includes("csv");
    if (!isCsv) {
      setParseError(null);
      setUploadError(
        "This file type is not supported. Please upload a ForeFlight logbook CSV."
      );
      return;
    }
    await handleForeFlightFile(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const isCsv =
      file.name.toLowerCase().endsWith(".csv") ||
      file.type.toLowerCase().includes("csv");
    if (!isCsv) {
      setParseError(null);
      setUploadError(
        "This file type is not supported. Please upload a ForeFlight logbook CSV."
      );
      return;
    }
    await handleForeFlightFile(file);
  };

  const handleDemoFill = () => {
    if (scopeFacilities.length === 0) {
      setFlightError("Airport list is still loading. Try again in a moment.");
      return;
    }
    const demoFlights = buildDemoLogbook(facilitiesByState);
    if (demoFlights.length === 0) {
      setFlightError("Airport list is still loading. Try again in a moment.");
      return;
    }
    setFlights(demoFlights);
    setFlightError(null);
    setUploadError(null);
    setParseError(null);
    setIsDemo(true);
    setLogbookStatus(null);
    setIsFreshVisit(false);
    setSelectedState("CONUS");
    setManualStateSelection(false);
  };

  const handleMostVisitedSort = (
    key: "id" | "name" | "location" | "count" | "lastVisited"
  ) => {
    setMostVisitedSort((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc"
        };
      }
      const direction =
        key === "count" || key === "lastVisited" ? "desc" : "asc";
      return { key, direction };
    });
  };

  const handleClearData = async () => {
    await clearAllLocalData();
    setFlights([]);
    setHasSavedCsv(false);
    setIsDemo(false);
    setLogbookStatus(null);
    setParseError(null);
    setUploadError(null);
    window.location.reload();
  };

  const handleExportVisitedCsv = () => {
    if (visitedFiltered.length === 0) return;
    const header = ["Airport ID", "Name", "City/County"];
    const rows = visitedFiltered.map((facility) => [
      facility.id,
      facility.name,
      facility.city || facility.county || ""
    ]);
    const csvLines = [header, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const str = String(value ?? "");
            if (str.includes(",") || str.includes("\"")) {
              return `"${str.replace(/\"/g, "\"\"")}"`;
            }
            return str;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csvLines], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "visited-airports.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const emptyMatches = hasFlights && visitedSet.size === 0;
  const showReportsEmpty = !hasFlights && !isDemo;

  useEffect(() => {
    setVisitedPage(0);
  }, [debouncedVisitedSearch, mapFilter, visitedSort, selectedState]);

  useEffect(() => {
    setTripPage(0);
  }, [
    homeBaseId,
    selectedState,
    tripMaxDistanceNm,
    tripMinRunwayFt,
    tripSurfaceFilter,
    tripTowerFilter
  ]);

  useEffect(() => {
    setUnvisitedPage(0);
  }, [debouncedUnvisitedSearch, mapFilter, unvisitedSort, selectedState, homeBaseId]);

  return (
    <div className="min-h-screen bg-bone" id="top">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <nav className="sticky top-2 z-20 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white/85 px-4 py-3 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <a
            href="#top"
            className="font-display text-xl text-ink hover:text-ink/80"
          >
            US Landings Map
          </a>
          <div className="flex flex-wrap items-center gap-4 text-xs text-ink/60 sm:justify-end">
            <a
              href="https://github.com/landings"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink"
            >
              GitHub
            </a>
            <a
              href="mailto:neal@nealmueller.com"
              className="hover:text-ink"
            >
              Feedback
            </a>
          </div>
        </nav>

        <section
          className="grid gap-6 rounded-3xl bg-white p-6 shadow-card sm:p-8"
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="flex flex-col gap-4">
            <p className="max-w-2xl text-base text-ink/70 sm:text-lg">
              Upload your ForeFlight logbook and see every public airport you have
              visited across the United States.
            </p>
          </div>

          {isDemo && (
            <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink/70 shadow-card">
              You are viewing a demo pilot. Upload your own ForeFlight logbook CSV to see
              your real logbook.
            </div>
          )}

          {parseError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {parseError}
            </div>
          )}

          <div
            className={`rounded-3xl border border-dashed p-6 ${
              isDragging ? "border-ink/50 bg-white/80" : "border-ink/20 bg-white/60"
            }`}
          >
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex min-h-[44px] w-[260px] cursor-pointer items-center justify-center rounded-2xl border border-ink/10 bg-pine px-4 py-3 text-sm font-semibold text-bone shadow-card">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleForeFlightUpload}
                />
                Upload ForeFlight logbook CSV
              </label>
              <button
                type="button"
                onClick={handleDemoFill}
                className="inline-flex min-h-[44px] w-[260px] items-center justify-center rounded-2xl border border-ink/10 bg-pine px-4 py-3 text-sm font-semibold text-bone shadow-card"
              >
                Try demo logbook
              </button>
              <button
                type="button"
                onClick={handleClearData}
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-ink/10 px-4 py-3 text-xs font-semibold text-ink/70"
              >
                Clear data &amp; reset demo
              </button>
            </div>
            {isParsing && (
              <div className="mt-3 flex items-center gap-2 text-xs text-ink/70">
                <span className="h-3 w-3 animate-spin rounded-full border border-ink/30 border-t-ink/70" />
                Processing logbook...
              </div>
            )}
            {uploadError && (
              <div className="mt-3 text-xs text-red-600">{uploadError}</div>
            )}
            <div className="mt-3 text-xs text-ink/70">
              Supports ForeFlight logbook CSV exports. Works on iPhone and desktop.
            </div>
            <div className="mt-2 text-xs text-ink/60">
              Logbook files are parsed in your browser only. No flight data is
              uploaded to a server.
            </div>
            {logbookStatus && (
              <div className="mt-2 text-xs text-ink/70">{logbookStatus}</div>
            )}
            {flightError && (
              <p className="mt-3 text-sm text-red-600">{flightError}</p>
            )}
            {emptyMatches && (
              <p className="mt-3 text-sm text-ink/70">
                Parsed flights, but no airport matches yet. Try a different
                notes scan, or verify K-prefix normalization.
              </p>
            )}
          </div>

        </section>

        <section className="grid gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl text-ink">Map</h3>
              <p className="text-sm text-ink/60">
                All public US airports. Visited airports are bright navy.
                Unvisited airports are black.
              </p>
              <p className="mt-2 text-xs text-ink/60">
                Coverage: {formatCount(coverage.visited)}/
                {formatCount(coverage.total)} public airports (
                {formatPercent(coverage.ratio)}) in {scopeLabel}.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-ink/70">
                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">
                  Most visited state: {mostVisitedState}
                </span>
                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">
                  Most visited airport: {mostVisitedAirport}
                </span>
                <span className="rounded-full border border-ink/10 bg-white px-3 py-1">
                  Last new airport: {lastNewAirport.label} on{" "}
                  {lastNewAirport.date}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs text-ink/70 shadow-card">
                <span className="uppercase tracking-[0.2em] text-ink/50">
                  Legend
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border border-white bg-[#0b2f8f]" />
                  Visited
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border border-white bg-[#0b0b0b]" />
                  Unvisited
                </span>
              </div>
              <div
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink/10 bg-white px-3 py-2 text-xs text-ink/70 shadow-card"
                role="radiogroup"
                aria-label="Airport visibility"
              >
                <button
                  type="button"
                  onClick={() => setMapFilter("all")}
                  className={`rounded-full px-3 py-1 ${
                    mapFilter === "all" ? "bg-ink text-bone" : "bg-white text-ink"
                  }`}
                  aria-pressed={mapFilter === "all"}
                >
                  All airports
                </button>
                <button
                  type="button"
                  onClick={() => setMapFilter("visited")}
                  className={`rounded-full px-3 py-1 ${
                    mapFilter === "visited"
                      ? "bg-ink text-bone"
                      : "bg-white text-ink"
                  }`}
                  aria-pressed={mapFilter === "visited"}
                >
                  Visited only
                </button>
                <button
                  type="button"
                  onClick={() => setMapFilter("unvisited")}
                  className={`rounded-full px-3 py-1 ${
                    mapFilter === "unvisited"
                      ? "bg-ink text-bone"
                      : "bg-white text-ink"
                  }`}
                  aria-pressed={mapFilter === "unvisited"}
                >
                  Unvisited only
                </button>
              </div>
              <label className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs text-ink/70 shadow-card">
                <span className="uppercase tracking-[0.2em] text-ink/50">
                  State
                </span>
                <select
                  className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs"
                  value={selectedState}
                  onChange={(event) => {
                    setSelectedState(event.target.value);
                    setManualStateSelection(true);
                  }}
                  aria-label={`State selection ${getStateName(selectedState)}`}
                >
                  {STATE_OPTIONS.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs text-ink/70 shadow-card">
                <span className="uppercase tracking-[0.2em] text-ink/50">
                  Dot size
                </span>
                <input
                  type="range"
                  min={DOT_RADIUS_MIN}
                  max={DOT_RADIUS_MAX}
                  value={dotRadius}
                  onChange={(event) =>
                    setDotRadius(Number(event.target.value))
                  }
                  className="accent-pine"
                  aria-label="Dot size"
                />
                <span>{dotRadius}px</span>
              </div>
            </div>
          </div>
          <div className="relative">
            <FacilityMap
              facilities={scopeFilteredFacilities}
              visitedIds={visitedSet}
              dotRadius={dotRadius}
              bounds={mapBounds}
              maxZoom={selectedState === "US" || selectedState === "CONUS" ? 4.2 : 8}
              fitPadding={selectedState === "US" || selectedState === "CONUS" ? [0, 0] : [12, 12]}
            />
            {isMapUpdating && (
              <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-ink/10 bg-white px-3 py-1 text-xs text-ink/70 shadow-card">
                Updating map...
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6">
          <h3 className="font-display text-2xl text-ink">Reports</h3>
          {showReportsEmpty ? (
            <div className="rounded-3xl border border-ink/10 bg-white p-6 text-sm text-ink/60 shadow-card">
              No logbook yet. Upload a ForeFlight logbook CSV to see states you have flown,
              most visited airports, and unvisited airports near your home base.
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
                <details open>
                  <summary className="font-display text-lg text-ink">
                    States in Logbook ({statesInLogbook.length})
                  </summary>
                  <div className="mt-4 space-y-3">
                    {statesInLogbook.length === 0 ? (
                      <p className="text-sm text-ink/60">
                        No states in logbook for {scopeLabel}.
                      </p>
                    ) : (
                      <div className="max-h-[320px] overflow-y-auto overflow-x-auto rounded-2xl border border-ink/10">
                        <table className="w-full text-left text-sm">
                          <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-ink/50">
                            <tr>
                              <th className="py-2 px-3">State</th>
                              <th className="py-2 px-3">Visited</th>
                              <th className="py-2 px-3">Total</th>
                              <th className="py-2 px-3">Coverage</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statesInLogbook.map((entry) => (
                              <tr key={entry.code} className="border-t border-ink/10">
                                <td className="py-2 px-3 font-medium">
                                  {entry.name}
                                </td>
                                <td className="py-2 px-3">
                                  {formatCount(entry.visited)}
                                </td>
                                <td className="py-2 px-3">
                                  {formatCount(entry.total)}
                                </td>
                                <td className="py-2 px-3">
                                  {formatPercent(entry.ratio)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </details>
              </div>
              <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
                <details open>
                  <summary className="font-display text-lg text-ink">
                    Most Visited Airports ({mostVisitedRows.length})
                  </summary>
                  <div className="mt-4 space-y-3">
                    {mostVisitedRows.length === 0 ? (
                      <p className="text-sm text-ink/60">
                        No visited airports match this scope in {scopeLabel}.
                      </p>
                    ) : (
                      <div className="max-h-[320px] overflow-y-auto overflow-x-auto rounded-2xl border border-ink/10">
                        <table className="w-full text-left text-sm">
                          <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-ink/50">
                            <tr>
                              <th className="py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() => handleMostVisitedSort("id")}
                                >
                                  Airport ID
                                </button>
                              </th>
                              <th className="py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() => handleMostVisitedSort("name")}
                                >
                                  Name
                                </button>
                              </th>
                              <th className="py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() => handleMostVisitedSort("location")}
                                >
                                  City/County
                                </button>
                              </th>
                              <th className="py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() => handleMostVisitedSort("count")}
                                >
                                  Visit Count
                                </button>
                              </th>
                              <th className="py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() => handleMostVisitedSort("lastVisited")}
                                >
                                  Last Visited Date
                                </button>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {mostVisitedRows.map((entry) => (
                              <tr key={entry.id} className="border-t border-ink/10">
                                <td className="py-2 px-3 font-medium">
                                  {entry.id}
                                </td>
                                <td className="py-2 px-3">{entry.name}</td>
                                <td className="py-2 px-3">{entry.location}</td>
                                <td className="py-2 px-3">{entry.count}</td>
                                <td className="py-2 px-3">
                                  {formatDateLabel(entry.lastVisited)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </>
          )}

          {!showReportsEmpty && (
            <>
              <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
                <details open>
                <summary className="font-display text-lg text-ink">
                  Trip Planner ({tripPlannerRows.length})
                </summary>
                <div className="mt-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="flex flex-col gap-2 text-sm text-ink/70">
                        <span className="font-medium text-ink">Home base airport</span>
                        <select
                          className="min-h-[44px] rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          value={homeBaseId || ""}
                          onChange={(event) =>
                            setHomeBaseId(event.target.value || null)
                          }
                          disabled={homeBaseOptions.length === 0}
                          aria-label={`Trip planner home base ${homeBaseId || ""}`}
                        >
                          {homeBaseOptions.length === 0 && (
                            <option value="">No visited airports yet</option>
                          )}
                          {homeBaseOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.id} — {option.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-ink/70">
                        <span className="font-medium text-ink">
                          Max distance ({tripMaxDistanceNm} nm)
                        </span>
                        <input
                          type="range"
                          min={TRIP_DISTANCE_MIN}
                          max={TRIP_DISTANCE_MAX}
                          step={25}
                          value={tripMaxDistanceNm}
                          onChange={(event) =>
                            setTripMaxDistanceNm(Number(event.target.value))
                          }
                          className="min-h-[44px] accent-pine"
                          aria-label="Trip planner maximum distance"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-ink/70">
                        <span className="font-medium text-ink">Minimum runway</span>
                        <select
                          className="min-h-[44px] rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          value={tripMinRunwayFt}
                          onChange={(event) =>
                            setTripMinRunwayFt(Number(event.target.value))
                          }
                        >
                          {tripRunwayOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-ink/70">
                        <span className="font-medium text-ink">Surface</span>
                        <select
                          className="min-h-[44px] rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          value={tripSurfaceFilter}
                          onChange={(event) =>
                            setTripSurfaceFilter(
                              event.target.value as TripSurfaceFilter
                            )
                          }
                        >
                          {tripSurfaceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-ink/70">
                        <span className="font-medium text-ink">Tower status</span>
                        <select
                          className="min-h-[44px] rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          value={tripTowerFilter}
                          onChange={(event) =>
                            setTripTowerFilter(event.target.value as TripTowerFilter)
                          }
                        >
                          {tripTowerOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {homeBaseOptions.length === 0 ? (
                      <div className="rounded-2xl border border-ink/10 bg-bone px-4 py-3 text-sm text-ink/70">
                        No visited airports yet.
                      </div>
                    ) : !homeBaseFacility ||
                      homeBaseFacility.latitude === undefined ||
                      homeBaseFacility.longitude === undefined ? (
                      <div className="rounded-2xl border border-ink/10 bg-bone px-4 py-3 text-sm text-ink/70">
                        Home base has no coordinates.
                      </div>
                    ) : (
                      <>
                        <div className="max-h-[360px] overflow-y-auto overflow-x-auto rounded-2xl border border-ink/10">
                          <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-ink/50">
                              <tr>
                                <th className="px-3 py-2">Airport</th>
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">Distance</th>
                                <th className="px-3 py-2">Runway</th>
                                <th className="px-3 py-2">Surface</th>
                                <th className="px-3 py-2">Towered</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tripPageItems.map(({ facility, distanceNm }) => (
                                <tr key={facility.id} className="border-t border-ink/10">
                                  <td className="px-3 py-2 font-medium">{facility.id}</td>
                                  <td className="px-3 py-2">
                                    {facility.name}
                                    <div className="text-xs text-ink/60">
                                      {facility.city || facility.county || "Unknown"}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    {Math.round(distanceNm)} nm
                                  </td>
                                  <td className="px-3 py-2">
                                    {getPlannedRunwayFt(facility.longestRunwayFt)
                                      ? `${getPlannedRunwayFt(
                                          facility.longestRunwayFt
                                        )?.toLocaleString()} ft`
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2">
                                    {formatSurfaceLabel(facility.surfaceCategory)}
                                  </td>
                                  <td className="px-3 py-2">
                                    {facility.towered === true
                                      ? "Yes"
                                      : facility.towered === false
                                        ? "No"
                                        : "Unknown"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {tripPlannerRows.length === 0 && (
                            <p className="px-3 py-4 text-sm text-ink/60">
                              No unvisited airports match this filter in {scopeLabel}.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-3 text-xs text-ink/60">
                          <span>
                            Page {tripPage + 1} of {tripPageCount}
                          </span>
                          <button
                            type="button"
                            className="rounded-full border border-ink/10 px-3 py-1 disabled:opacity-40"
                            onClick={() =>
                              setTripPage((page) => Math.max(0, page - 1))
                            }
                            disabled={tripPage === 0}
                            aria-label="Previous trip planner page"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-ink/10 px-3 py-1 disabled:opacity-40"
                            onClick={() =>
                              setTripPage((page) =>
                                Math.min(tripPageCount - 1, page + 1)
                              )
                            }
                            disabled={tripPage >= tripPageCount - 1}
                            aria-label="Next trip planner page"
                          >
                            Next
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </details>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
                  <details open>
                    <summary className="font-display text-lg text-ink">
                      Visited Airports ({visitedFiltered.length})
                    </summary>
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap gap-3">
                        <input
                          type="search"
                          placeholder="Search by ID, name, city"
                          className="min-h-[44px] flex-1 rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          value={visitedSearch}
                          onChange={(event) => {
                            setVisitedSearch(event.target.value);
                            setVisitedPage(0);
                          }}
                        />
                        <select
                          className="min-h-[44px] rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          value={visitedSort}
                          onChange={(event) =>
                            setVisitedSort(event.target.value as SortKey)
                          }
                        >
                          {mapSortOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              Sort by {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleExportVisitedCsv}
                          className="min-h-[44px] rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm font-semibold text-ink shadow-card"
                        >
                          Export visited list as CSV
                        </button>
                      </div>
                      <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-ink/10">
                        <table className="w-full text-left text-sm">
                          <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-ink/50">
                            <tr>
                              <th className="px-3 py-2">Airport</th>
                              <th className="px-3 py-2">Name</th>
                              <th className="px-3 py-2">City/County</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visitedPageItems.map((facility) => (
                              <tr key={facility.id} className="border-t border-ink/10">
                                <td className="px-3 py-2 font-medium">
                                  {facility.id}
                                </td>
                                <td className="px-3 py-2">{facility.name}</td>
                                <td className="px-3 py-2">
                                  {facility.city || facility.county}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {visitedFiltered.length === 0 && (
                          <p className="px-3 py-4 text-sm text-ink/60">
                            No visited airports match this search in {scopeLabel}.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-3 text-xs text-ink/60">
                        <span>
                          Page {visitedPage + 1} of {visitedPageCount}
                        </span>
                        <button
                          type="button"
                          className="rounded-full border border-ink/10 px-3 py-1 disabled:opacity-40"
                          onClick={() =>
                            setVisitedPage((page) => Math.max(0, page - 1))
                          }
                          disabled={visitedPage === 0}
                          aria-label="Previous visited page"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-ink/10 px-3 py-1 disabled:opacity-40"
                          onClick={() =>
                            setVisitedPage((page) =>
                              Math.min(visitedPageCount - 1, page + 1)
                            )
                          }
                          disabled={visitedPage >= visitedPageCount - 1}
                          aria-label="Next visited page"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </details>
                </div>

                <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
                  <details open>
                    <summary className="font-display text-lg text-ink">
                      Unvisited Airports ({unvisitedSorted.length})
                    </summary>
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap gap-3">
                        <input
                          type="search"
                          placeholder="Search by ID, name, city"
                          className="min-h-[44px] flex-1 rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          value={unvisitedSearch}
                          onChange={(event) => {
                            setUnvisitedSearch(event.target.value);
                            setUnvisitedPage(0);
                          }}
                        />
                        <select
                          className="min-h-[44px] rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          value={unvisitedSort}
                          onChange={(event) =>
                            setUnvisitedSort(event.target.value as UnvisitedSortKey)
                          }
                        >
                          {unvisitedSortOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              Sort by {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-ink/10">
                        <table className="w-full text-left text-sm">
                          <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-ink/50">
                            <tr>
                              <th className="px-3 py-2">Airport</th>
                              <th className="px-3 py-2">Name</th>
                              <th className="px-3 py-2">City/County</th>
                              <th className="px-3 py-2">Distance from home</th>
                            </tr>
                          </thead>
                          <tbody>
                            {unvisitedPageItems.map((facility) => {
                              let distanceLabel = "—";
                              if (
                                homeBaseFacility &&
                                homeBaseFacility.latitude !== undefined &&
                                homeBaseFacility.longitude !== undefined &&
                                facility.latitude !== undefined &&
                                facility.longitude !== undefined
                              ) {
                                const distance = calculateDistanceNm(
                                  {
                                    latitude: homeBaseFacility.latitude,
                                    longitude: homeBaseFacility.longitude
                                  },
                                  {
                                    latitude: facility.latitude,
                                    longitude: facility.longitude
                                  }
                                );
                                distanceLabel = `${Math.round(distance)} nm`;
                              }
                              return (
                                <tr key={facility.id} className="border-t border-ink/10">
                                  <td className="px-3 py-2 font-medium">
                                    {facility.id}
                                  </td>
                                  <td className="px-3 py-2">{facility.name}</td>
                                  <td className="px-3 py-2">
                                    {facility.city || facility.county}
                                  </td>
                                  <td className="px-3 py-2">{distanceLabel}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {unvisitedSorted.length === 0 && (
                          <p className="px-3 py-4 text-sm text-ink/60">
                            No unvisited airports match this search in {scopeLabel}.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-3 text-xs text-ink/60">
                        <span>
                          Page {unvisitedPage + 1} of {unvisitedPageCount}
                        </span>
                        <button
                          type="button"
                          className="rounded-full border border-ink/10 px-3 py-1 disabled:opacity-40"
                          onClick={() =>
                            setUnvisitedPage((page) => Math.max(0, page - 1))
                          }
                          disabled={unvisitedPage === 0}
                          aria-label="Previous unvisited page"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-ink/10 px-3 py-1 disabled:opacity-40"
                          onClick={() =>
                            setUnvisitedPage((page) =>
                              Math.min(unvisitedPageCount - 1, page + 1)
                            )
                          }
                          disabled={unvisitedPage >= unvisitedPageCount - 1}
                          aria-label="Next unvisited page"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="rounded-3xl border border-ink/10 bg-white p-6 text-xs text-ink/60 shadow-card">
          © 2024 Landings. All rights reserved. All logbook parsing happens in your
          browser. No flight data is sent to a server. {sourcesSummary}
        </section>

        {publicError && (
          <p className="text-sm text-red-600">{publicError}</p>
        )}
      </div>
    </div>
  );
}
