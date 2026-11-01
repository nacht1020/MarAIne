// Illegal-fishing hotspot ranking. Pure functions: shared by the dashboard and the mobile app.
//
// RULE (shown on the hotspot page):
// - Incidents with a location are grouped into square cells of HOTSPOT_CELL_DEG (about 2.2 km).
// - score = flagged catch logs
//         + OPEN_REPORT_WEIGHT x reports still received or investigating
//         + RESOLVED_REPORT_WEIGHT x resolved reports
// - Cells are ranked by score, then by most recent incident.
// A hotspot is a place to send a patrol or check with fishers, not a finding against anyone.

import { nearestTown } from "./biodiversity";
import type { CatchStatus, ReportStatus, ReportType } from "@/lib/types";

export const HOTSPOT_CELL_DEG = 0.02;
export const OPEN_REPORT_WEIGHT = 2;
export const RESOLVED_REPORT_WEIGHT = 1;
export const PERIOD_OPTIONS = [30, 60, 90] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

export type CatchIncident = {
  kind: "catch";
  id: string;
  lat: number;
  lng: number;
  at: string;
  status: CatchStatus;
  species: string;
  fisher: string;
  reasons: string[];
  zoneName: string | null;
};

export type ReportIncident = {
  kind: "report";
  id: string;
  lat: number;
  lng: number;
  at: string;
  status: ReportStatus;
  type: ReportType;
  description: string;
};

export type Incident = CatchIncident | ReportIncident;

export type Hotspot = {
  key: string;
  rank: number;
  lat: number;
  lng: number;
  area: string;
  score: number;
  catchCount: number;
  openReports: number;
  resolvedReports: number;
  topReasons: { code: string; count: number }[];
  lastAt: string;
  incidents: Incident[];
};

function incidentScore(i: Incident) {
  if (i.kind === "catch") return 1;
  return i.status === "resolved" ? RESOLVED_REPORT_WEIGHT : OPEN_REPORT_WEIGHT;
}

export function computeHotspots(incidents: Incident[]): Hotspot[] {
  const groups = new Map<string, Incident[]>();
  for (const i of incidents) {
    const key = `${Math.floor(i.lat / HOTSPOT_CELL_DEG)}:${Math.floor(i.lng / HOTSPOT_CELL_DEG)}`;
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  }

  const hotspots: Hotspot[] = Array.from(groups.entries()).map(([key, list]) => {
    const lat = list.reduce((s, i) => s + i.lat, 0) / list.length;
    const lng = list.reduce((s, i) => s + i.lng, 0) / list.length;

    const reasons = new Map<string, number>();
    const zones = new Map<string, number>();
    for (const i of list) {
      if (i.kind !== "catch") continue;
      for (const r of i.reasons) reasons.set(r, (reasons.get(r) ?? 0) + 1);
      if (i.zoneName) zones.set(i.zoneName, (zones.get(i.zoneName) ?? 0) + 1);
    }
    const topZone = Array.from(zones.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      key,
      rank: 0,
      lat,
      lng,
      area: topZone ?? nearestTown(lat, lng),
      score: list.reduce((s, i) => s + incidentScore(i), 0),
      catchCount: list.filter((i) => i.kind === "catch").length,
      openReports: list.filter((i) => i.kind === "report" && i.status !== "resolved").length,
      resolvedReports: list.filter((i) => i.kind === "report" && i.status === "resolved").length,
      topReasons: Array.from(reasons.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      lastAt: list.reduce((m, i) => (i.at > m ? i.at : m), ""),
      incidents: [...list].sort((a, b) => b.at.localeCompare(a.at)),
    };
  });

  hotspots.sort((a, b) => b.score - a.score || b.lastAt.localeCompare(a.lastAt));
  hotspots.forEach((h, idx) => (h.rank = idx + 1));
  return hotspots;
}
