"use client";
import { MapContainer, TileLayer, Popup, Marker } from "react-leaflet";
import L from "leaflet";
import type { Facility } from "@/lib/datasets";

export type FacilityMapProps = {
  facilities: Facility[];
  visitedIds: Set<string>;
};

const visitedIcon = L.divIcon({
  className: "marker-visited",
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const unvisitedIcon = L.divIcon({
  className: "marker-unvisited",
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

export default function FacilityMap({
  facilities,
  visitedIds
}: FacilityMapProps) {
  const markers = facilities;

  return (
    <div className="h-[360px] w-full overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-card">
      <MapContainer
        center={[36.8, -119.6]}
        zoom={6}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((facility) => {
          if (facility.latitude === undefined || facility.longitude === undefined) {
            return null;
          }
          const visited = visitedIds.has(facility.id);
          return (
            <Marker
              key={facility.id}
              position={[facility.latitude, facility.longitude]}
              icon={visited ? visitedIcon : unvisitedIcon}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{facility.id}</div>
                  <div className="text-xs text-ink/70">{facility.name}</div>
                  <div className="text-xs text-ink/60">
                    {facility.city || facility.county || ""}
                  </div>
                  <div className="text-xs font-medium text-ink/80">
                    {visited ? "Visited" : "Not visited"}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
