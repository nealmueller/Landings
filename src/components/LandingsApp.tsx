"use client";

import { useMemo, useState, useEffect } from "react";
import FacilityMap from "@/components/FacilityMap";
import {
  buildScopeFacilities,
  computeFacilityMatches,
  computeVisitedSet,
  computeFrequency,
  type Scope
} from "@/lib/coverage";
import { parseFacilitiesMaster, type Facility } from "@/lib/datasets";
import { parseForeFlightCsv, type FlightRow } from "@/lib/foreflight";

const TEXT_TOGGLE_NOTE =
  "Matches in notes/remarks count as landings without requiring keywords.";

const mapSortOptions = [
  { value: "id", label: "Airport ID" },
  { value: "name", label: "Name" },
  { value: "city", label: "City" }
];

type SortKey = (typeof mapSortOptions)[number]["value"];

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function sortFacilities(list: Facility[], sortKey: SortKey) {
  return [...list].sort((a, b) =>
    (a[sortKey] || "").localeCompare(b[sortKey] || "")
  );
}

export default function LandingsApp() {
  const [publicFacilities, setPublicFacilities] = useState<Facility[]>([]);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [frequencyExpanded, setFrequencyExpanded] = useState(false);
  const [visitedSearch, setVisitedSearch] = useState("");
  const [unvisitedSearch, setUnvisitedSearch] = useState("");
  const [visitedSort, setVisitedSort] = useState<SortKey>("id");
  const [unvisitedSort, setUnvisitedSort] = useState<SortKey>("id");
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

  useEffect(() => {
    let isMounted = true;
    fetch("/data/ca/facilities_master.csv")
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

    fetch("/data/ca/sources.json")
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

  const scope: Scope = "public";

  const scopeFacilities = useMemo(
    () => buildScopeFacilities(scope, publicFacilities, [], false),
    [scope, publicFacilities]
  );

  const facilityIds = useMemo(
    () => new Set(scopeFacilities.map((facility) => facility.id)),
    [scopeFacilities]
  );

  const matches = useMemo(
    () => computeFacilityMatches(flights, facilityIds),
    [flights, facilityIds]
  );

  const visitedSet = useMemo(
    () =>
      computeVisitedSet(matches, {
        includeNotes,
        useEndpoints: true,
        arrivalsOnly: false
      }),
    [matches, includeNotes]
  );

  const frequency = useMemo(
    () =>
      computeFrequency(matches, {
        includeNotes,
        useEndpoints: true,
        arrivalsOnly: false
      }),
    [matches, includeNotes]
  );

  const visitedFacilities = useMemo(
    () => scopeFacilities.filter((facility) => visitedSet.has(facility.id)),
    [scopeFacilities, visitedSet]
  );

  const unvisitedFacilities = useMemo(
    () => scopeFacilities.filter((facility) => !visitedSet.has(facility.id)),
    [scopeFacilities, visitedSet]
  );

  const coverage = useMemo(() => {
    const total = scopeFacilities.length;
    const visited = visitedFacilities.length;
    const ratio = total > 0 ? visited / total : 0;
    return { total, visited, ratio };
  }, [scopeFacilities, visitedFacilities]);

  const coverageCards = useMemo(() => {
    const facilities = buildScopeFacilities("public", publicFacilities, [], false);
    const ids = new Set(facilities.map((facility) => facility.id));
    const scopeMatches = computeFacilityMatches(flights, ids);
    const scopeVisited = computeVisitedSet(scopeMatches, {
      includeNotes,
      useEndpoints: true,
      arrivalsOnly: false
    });
    const total = facilities.length;
    const visited = scopeVisited.size;
    return [
      {
        scope: "public" as Scope,
        total,
        visited,
        ratio: total > 0 ? visited / total : 0
      }
    ];
  }, [publicFacilities, flights, includeNotes]);

  const frequencyList = useMemo(() => {
    const entries = Array.from(frequency.entries())
      .map(([id, data]) => ({ id, ...data }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total);

    return frequencyExpanded ? entries : entries.slice(0, 25);
  }, [frequency, frequencyExpanded]);

  const visitedFiltered = useMemo(() => {
    const filtered = visitedFacilities.filter((facility) => {
      const query = visitedSearch.trim().toLowerCase();
      if (!query) return true;
      return (
        facility.id.toLowerCase().includes(query) ||
        facility.name.toLowerCase().includes(query) ||
        facility.city.toLowerCase().includes(query) ||
        facility.county.toLowerCase().includes(query)
      );
    });

    return sortFacilities(filtered, visitedSort);
  }, [visitedFacilities, visitedSearch, visitedSort]);

  const unvisitedFiltered = useMemo(() => {
    const filtered = unvisitedFacilities.filter((facility) => {
      const query = unvisitedSearch.trim().toLowerCase();
      if (!query) return true;
      return (
        facility.id.toLowerCase().includes(query) ||
        facility.name.toLowerCase().includes(query) ||
        facility.city.toLowerCase().includes(query) ||
        facility.county.toLowerCase().includes(query)
      );
    });

    return sortFacilities(filtered, unvisitedSort);
  }, [unvisitedFacilities, unvisitedSearch, unvisitedSort]);

  const hasFlights = flights.length > 0;
  const handleForeFlightUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = parseForeFlightCsv(text);
    setFlights(result.flights);
    setFlightError(result.error || null);
  };

  const emptyMatches = hasFlights && visitedSet.size === 0;

  return (
    <div className="min-h-screen bg-bone">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-12">
        <section className="grid gap-10 rounded-[32px] bg-white/70 p-10 shadow-card backdrop-blur">
          <div className="flex flex-col gap-4">
            <h1 className="font-display text-4xl text-ink sm:text-5xl">
              Landings
            </h1>
            <p className="max-w-2xl text-base text-ink/70 sm:text-lg">
              Beta version only includes California. Import your ForeFlight logbook
              and see what percentage of CA airports you have landed at.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-ink/10 bg-bone/60 p-6">
              <h2 className="font-display text-xl text-ink">
                Import ForeFlight CSV
              </h2>
              <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-2xl border border-ink/10 bg-pine px-4 py-3 text-sm font-semibold text-bone shadow-card">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleForeFlightUpload}
                />
                Upload Foreflight Logbook CSV
              </label>
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

            <div className="rounded-3xl border border-ink/10 bg-pine text-bone">
              <details className="p-6">
                <summary className="font-display text-lg">
                  How to export from ForeFlight
                </summary>
                <div className="mt-4 space-y-4 text-sm text-bone/80">
                  <div>
                    <p className="text-sm font-semibold text-bone">iPhone</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Logbook &gt; More &gt; Export.</li>
                      <li>Select CSV format.</li>
                      <li>Share to Files and save locally.</li>
                    </ol>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-bone">iPad</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Logbook &gt; Export.</li>
                      <li>Choose CSV.</li>
                      <li>Save to Files.</li>
                    </ol>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-bone">Desktop</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Log into ForeFlight Web.</li>
                      <li>Logbook &gt; Export &gt; CSV.</li>
                      <li>Download the file.</li>
                    </ol>
                  </div>
                </div>
              </details>
            </div>
          </div>

        </section>

        <section className="grid gap-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl text-ink">Dashboard</h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {coverageCards.map((card) => (
              <div
                key={card.scope}
                className="rounded-2xl border border-ink/10 bg-white p-4 shadow-card"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-ink/60">
                  Public airports
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {formatCount(card.visited)}/{formatCount(card.total)}
                </p>
                <p className="text-sm text-ink/70">
                  {formatPercent(card.ratio)} coverage
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-ink/60">
                  Coverage
                </p>
                <p className="mt-1 font-display text-xl text-ink">
                  Public airports
                </p>
              </div>
              <div className="min-w-[220px] flex-1">
                <div className="h-2 w-full rounded-full bg-fog">
                  <div
                    className="h-2 rounded-full bg-pine"
                    style={{ width: `${coverage.ratio * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-ink/60">
                  {formatCount(coverage.visited)} of {formatCount(coverage.total)}{" "}
                  - {formatPercent(coverage.ratio)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr]">
              <div className="rounded-2xl border border-ink/10 bg-bone/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink/60">
                  Match rules
                </p>
                <div className="mt-3 space-y-3 text-sm">
                  <label className="flex items-center justify-between gap-3">
                    <span>Include notes scan</span>
                    <input
                      type="checkbox"
                      checked={includeNotes}
                      onChange={(event) => setIncludeNotes(event.target.checked)}
                    />
                  </label>
                  <p className="text-xs text-ink/60">{TEXT_TOGGLE_NOTE}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl text-ink">Map</h3>
              <p className="text-sm text-ink/60">
                All airports shown. Visited in green, unvisited in grey.
              </p>
            </div>
          </div>
          <FacilityMap
            facilities={scopeFacilities}
            visitedIds={visitedSet}
          />
        </section>

        <section className="grid gap-6">
          <h3 className="font-display text-2xl text-ink">Reports</h3>
          <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
            <details open>
              <summary className="font-display text-lg text-ink">
                Most Visited Airports
              </summary>
              <div className="mt-4 space-y-3">
                {frequencyList.length === 0 ? (
                  <p className="text-sm text-ink/60">
                    No matches yet. Upload a logbook to populate this list.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-ink/50">
                        <tr>
                          <th className="py-2">Airport</th>
                          <th className="py-2">Total</th>
                          <th className="py-2">From</th>
                          <th className="py-2">To</th>
                          <th className="py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {frequencyList.map((entry) => {
                          const facility = scopeFacilities.find(
                            (item) => item.id === entry.id
                          );
                          return (
                            <tr key={entry.id} className="border-t border-ink/10">
                              <td className="py-2 font-medium">
                                {entry.id}
                                <div className="text-xs text-ink/60">
                                  {facility?.name || ""}
                                </div>
                              </td>
                              <td className="py-2">{entry.total}</td>
                              <td className="py-2">{entry.counts.endpoint_from}</td>
                              <td className="py-2">{entry.counts.endpoint_to}</td>
                              <td className="py-2">{entry.counts.notes_match}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {frequency.size > 25 && (
                  <button
                    className="rounded-full border border-ink/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-ink/70"
                    onClick={() => setFrequencyExpanded((prev) => !prev)}
                  >
                    {frequencyExpanded ? "Show top 25" : "Show all"}
                  </button>
                )}
              </div>
            </details>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
              <details open>
                <summary className="font-display text-lg text-ink">
                  Visited Airports
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <input
                      type="search"
                      placeholder="Search by ID, name, city"
                      className="flex-1 rounded-xl border border-ink/10 px-3 py-2 text-sm"
                      value={visitedSearch}
                      onChange={(event) => setVisitedSearch(event.target.value)}
                    />
                    <select
                      className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
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
                  </div>
                  <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-ink/10">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-ink/50">
                        <tr>
                          <th className="px-3 py-2">Airport</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">City/County</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitedFiltered.map((facility) => (
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
                        No visited airports match this search.
                      </p>
                    )}
                  </div>
                </div>
              </details>
            </div>

            <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-card">
              <details open>
                <summary className="font-display text-lg text-ink">
                  Unvisited Airports
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <input
                      type="search"
                      placeholder="Search by ID, name, city"
                      className="flex-1 rounded-xl border border-ink/10 px-3 py-2 text-sm"
                      value={unvisitedSearch}
                      onChange={(event) =>
                        setUnvisitedSearch(event.target.value)
                      }
                    />
                    <select
                      className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                      value={unvisitedSort}
                      onChange={(event) =>
                        setUnvisitedSort(event.target.value as SortKey)
                      }
                    >
                      {mapSortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          Sort by {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-ink/10">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-ink/50">
                        <tr>
                          <th className="px-3 py-2">Airport</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">City/County</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unvisitedFiltered.map((facility) => (
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
                    {unvisitedFiltered.length === 0 && (
                      <p className="px-3 py-4 text-sm text-ink/60">
                        All airports are visited.
                      </p>
                    )}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-ink/10 bg-white p-6 text-xs text-ink/60 shadow-card">
          <div className="space-y-3">
            <p>
              Privacy note: All parsing and matching runs on your device. No
              server-side uploads, accounts, analytics, or tracking.
            </p>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-ink/50">
                Sources
              </p>
              <div className="mt-2 space-y-2">
                {sourceList.map((source) => (
                  <div
                    key={source.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink/10 bg-bone/60 px-3 py-2"
                  >
                    <div>
                      <div className="text-xs font-semibold text-ink/80">
                        {source.name}
                      </div>
                      <div className="text-[11px] text-ink/60">{source.file}</div>
                    </div>
                    <div className="text-[11px] text-ink/60">
                      Deduped: {source.deduped} · Corroborated:{" "}
                      {source.corroborated} · Updated: {source.updated}
                      {source.total ? ` · Rows: ${source.total}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {publicError && (
          <p className="text-sm text-red-600">{publicError}</p>
        )}
      </div>
    </div>
  );
}
