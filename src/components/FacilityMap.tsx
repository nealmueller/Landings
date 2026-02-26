"use client";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Facility } from "@/lib/datasets";

export type FacilityMapProps = {
  facilities: Facility[];
  visitedIds: Set<string>;
  dotRadius: number;
  bounds: [[number, number], [number, number]] | null;
  maxZoom?: number;
  fitPadding?: [number, number];
};

const VISITED_FILL = "#0b2f8f";
const UNVISITED_FILL = "#0b0b0b";
const STROKE_COLOR = "#ffffff";
const VISITED_OPACITY = 0.9;
const UNVISITED_OPACITY = 0.7;
const STROKE_WEIGHT = 1.5;
const canvasRenderer = L.canvas({ padding: 0.5 });

type FacilityLayerProps = {
  facilities: Facility[];
  visitedIds: Set<string>;
  dotRadius: number;
};

function FacilityLayer({ facilities, visitedIds, dotRadius }: FacilityLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const radiusRef = useRef(dotRadius);

  useEffect(() => {
    radiusRef.current = dotRadius;
  }, [dotRadius]);

  useEffect(() => {
    if (!layerRef.current) {
      layerRef.current = L.layerGroup().addTo(map);
    }
    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
      markersRef.current = [];
    };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.clearLayers();
    markersRef.current = [];

    const currentRadius = radiusRef.current;
    facilities.forEach((facility) => {
      if (facility.latitude === undefined || facility.longitude === undefined) {
        return;
      }
      const visited = visitedIds.has(facility.id);
      const locationLabel = facility.city || facility.county || "Unknown";
      const tooltipLabel = `${facility.id} (${facility.name}) – ${locationLabel}`;
      const marker = L.circleMarker([facility.latitude, facility.longitude], {
        radius: currentRadius,
        color: STROKE_COLOR,
        weight: STROKE_WEIGHT,
        fillColor: visited ? VISITED_FILL : UNVISITED_FILL,
        fillOpacity: visited ? VISITED_OPACITY : UNVISITED_OPACITY,
        renderer: canvasRenderer
      });
      marker.bindTooltip(tooltipLabel, { sticky: true });
      marker.on("click", () => {
        markersRef.current.forEach((other) => {
          if (other !== marker) {
            other.closeTooltip();
          }
        });
        marker.openTooltip();
      });
      layerRef.current?.addLayer(marker);
      markersRef.current.push(marker);
    });
  }, [facilities, visitedIds]);

  useEffect(() => {
    const closeAll = () => {
      markersRef.current.forEach((marker) => marker.closeTooltip());
    };
    map.on("click", closeAll);
    return () => {
      map.off("click", closeAll);
    };
  }, [map]);

  useEffect(() => {
    markersRef.current.forEach((marker) => marker.setRadius(dotRadius));
  }, [dotRadius]);

  return null;
}

type MapBoundsProps = {
  bounds: [[number, number], [number, number]] | null;
  maxZoom?: number;
  fitPadding?: [number, number];
};

function MapBounds({ bounds, maxZoom, fitPadding }: MapBoundsProps) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, {
      padding: fitPadding ?? [0, 0],
      maxZoom
    });
  }, [map, bounds, fitPadding, maxZoom]);

  return null;
}

export default function FacilityMap({
  facilities,
  visitedIds,
  dotRadius,
  bounds,
  maxZoom,
  fitPadding
}: FacilityMapProps) {
  return (
    <div className="h-[100svh] w-full overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-card">
      <MapContainer
        center={[36.8, -119.6]}
        zoom={6}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          opacity={0.38}
        />
        <FacilityLayer
          facilities={facilities}
          visitedIds={visitedIds}
          dotRadius={dotRadius}
        />
        <MapBounds bounds={bounds} maxZoom={maxZoom} fitPadding={fitPadding} />
      </MapContainer>
    </div>
  );
}
