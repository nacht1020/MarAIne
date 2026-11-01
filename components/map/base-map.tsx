"use client";

import "leaflet/dist/leaflet.css";
import type { ReactNode } from "react";
import { AttributionControl, MapContainer, TileLayer, ZoomControl } from "react-leaflet";
import { MARINDUQUE_CENTER, MARINDUQUE_ZOOM } from "@/lib/zones/geo";
import { cn } from "@/lib/utils";

// OpenStreetMap standard tiles: no API key; attribution required (tile usage policy: light, interactive use).
// Colors are muted with CSS (.huliko-map in globals.css) so zones and data layers stand out; dark mode inverts them.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// The tile licence requires this credit; it is kept short and quiet, without the Leaflet logo.
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>';

/** Client-only. Import through next/dynamic with ssr: false. */
export function BaseMap({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <MapContainer
      center={MARINDUQUE_CENTER}
      zoom={MARINDUQUE_ZOOM}
      minZoom={9}
      maxZoom={17}
      zoomControl={false}
      attributionControl={false}
      className={cn("huliko-map h-full w-full bg-muted", className)}
    >
      <AttributionControl position="bottomleft" prefix={false} />
      <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} />
      <ZoomControl position="bottomright" />
      {children}
    </MapContainer>
  );
}
