"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Info, Loader2, MapPinOff, ShieldAlert } from "lucide-react";
import { CatchStatusBadge } from "@/components/catch/catch-status";
import { EmptyState } from "@/components/data/states";
import { ReportStatusBadge } from "@/components/reports/report-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { HOTSPOT_CELL_DEG, OPEN_REPORT_WEIGHT, PERIOD_OPTIONS, RESOLVED_REPORT_WEIGHT, type Hotspot } from "@/lib/analytics/hotspots";
import { flagLabel } from "@/lib/catch/flags";
import { REPORT_TYPE_LABELS } from "@/lib/reports/labels";
import type { ZoneWithGeoJson } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MARKER_COLORS } from "./markers";

const HotspotMap = dynamic(() => import("./hotspot-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

type Props = {
  hotspots: Hotspot[];
  zones: ZoneWithGeoJson[];
  days: number;
  includeReviewed: boolean;
  unmappedFlagged: number;
};

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export function HotspotsView({ hotspots, zones, days, includeReviewed, unmappedFlagged }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [layers, setLayers] = useState({ catches: true, reports: true, zones: true });

  function push(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    setSelectedKey(null);
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
  }

  const selected = hotspots.find((h) => h.key === selectedKey) ?? null;
  const top = hotspots.slice(0, 10);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Hotspot filters">
        <div role="group" aria-label="Period" className="flex rounded-md border bg-card p-0.5">
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => push("days", String(d))}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                days === d ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Last {d} days
            </button>
          ))}
        </div>

        <div className="ml-1 flex items-center gap-2">
          <Switch id="include-reviewed" checked={includeReviewed} onCheckedChange={(v) => push("reviewed", v ? "1" : null)} />
          <Label htmlFor="include-reviewed" className="text-sm font-normal">
            Include reviewed logs
          </Label>
        </div>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <span className="text-xs text-muted-foreground">Show</span>
        <ToggleChip pressed={layers.catches} onClick={() => setLayers((l) => ({ ...l, catches: !l.catches }))}>
          <span className="size-2.5 rounded-full border border-white" style={{ backgroundColor: MARKER_COLORS.flagged }} aria-hidden />
          Flagged logs
        </ToggleChip>
        <ToggleChip pressed={layers.reports} onClick={() => setLayers((l) => ({ ...l, reports: !l.reports }))}>
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: MARKER_COLORS.received }} aria-hidden />
          Reports
        </ToggleChip>
        <ToggleChip pressed={layers.zones} onClick={() => setLayers((l) => ({ ...l, zones: !l.zones }))}>
          <span className="size-2.5 rounded-sm border border-dashed border-current" aria-hidden />
          Protected zones
        </ToggleChip>

        {pending && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Updating
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:h-[calc(100vh-13rem)] lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="relative h-[55vh] overflow-hidden rounded-lg border lg:h-full">
          {hotspots.length === 0 ? (
            <EmptyState
              className="h-full rounded-none border-0"
              icon={ShieldAlert}
              title="No flagged logs or reports with a location in this period"
              description="Try a longer period or include reviewed logs."
            />
          ) : (
            <HotspotMap hotspots={hotspots} zones={zones} selectedKey={selectedKey} layers={layers} onSelect={setSelectedKey} />
          )}
          <MapLegend />
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card" aria-label="Hotspots">
          {selected ? (
            <HotspotDetail hotspot={selected} onBack={() => setSelectedKey(null)} />
          ) : (
            <>
              <header className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Top hotspots</h2>
                <p className="text-xs text-muted-foreground">
                  Score = flagged logs + {OPEN_REPORT_WEIGHT} x open reports + {RESOLVED_REPORT_WEIGHT} x resolved reports, per{" "}
                  {Math.round(HOTSPOT_CELL_DEG * 111)} km area.
                </p>
              </header>
              <ol className="min-h-0 flex-1 divide-y overflow-y-auto">
                {top.map((h) => (
                  <li key={h.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(h.key)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular",
                          h.rank <= 3 ? "bg-navy text-navy-foreground" : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {h.rank}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{h.area}</span>
                          <span className="shrink-0 text-xs tabular text-muted-foreground">
                            Score <span className="font-semibold text-foreground">{h.score}</span>
                          </span>
                        </span>
                        <span className="block text-xs text-muted-foreground tabular">
                          {h.catchCount} flagged {h.catchCount === 1 ? "log" : "logs"} · {h.openReports} open{" "}
                          {h.openReports === 1 ? "report" : "reports"}
                          {h.resolvedReports > 0 && ` · ${h.resolvedReports} resolved`}
                        </span>
                        {h.topReasons.length > 0 && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {h.topReasons.map((r) => `${flagLabel(r.code)} (${r.count})`).join(", ")}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <footer className="space-y-1.5 border-t px-4 py-3 text-xs text-muted-foreground">
                {unmappedFlagged > 0 && (
                  <p className="flex gap-2">
                    <MapPinOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {unmappedFlagged} flagged {unmappedFlagged === 1 ? "log has" : "logs have"} no location (SMS) and {unmappedFlagged === 1 ? "is" : "are"} not mapped.
                  </p>
                )}
                <p className="flex gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />A hotspot is a place to patrol or check with fishers. Flags are for review, not a finding. SAMPLE DATA.
                </p>
              </footer>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

function HotspotDetail({ hotspot, onBack }: { hotspot: Hotspot; onBack: () => void }) {
  return (
    <>
      <header className="flex items-start gap-2 border-b px-2 py-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to top hotspots">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 py-1">
          <h2 className="truncate text-sm font-semibold">
            #{hotspot.rank} {hotspot.area}
          </h2>
          <p className="text-xs text-muted-foreground tabular">
            Score {hotspot.score} · {hotspot.incidents.length} incidents · latest {dateFmt(hotspot.lastAt)}
          </p>
        </div>
      </header>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {hotspot.incidents.map((i) => (
          <li key={`${i.kind}-${i.id}`} className="space-y-1.5 px-4 py-3">
            {i.kind === "catch" ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{i.species}</span>
                  <CatchStatusBadge status={i.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Catch log · {dateFmt(i.at)} · {i.fisher}
                  {i.zoneName && ` · ${i.zoneName}`}
                </p>
                <ul className="list-inside list-disc text-xs">
                  {i.reasons.map((r) => (
                    <li key={r}>{flagLabel(r)}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{REPORT_TYPE_LABELS[i.type]}</span>
                  <ReportStatusBadge status={i.status} />
                </div>
                <p className="text-xs text-muted-foreground">Community report · {dateFmt(i.at)}</p>
                <p className="text-xs">{i.description}</p>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function ToggleChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-foreground/30 bg-card font-medium text-foreground" : "bg-transparent text-muted-foreground line-through decoration-muted-foreground/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MapLegend() {
  const items = [
    { shape: "circle", color: MARKER_COLORS.flagged, label: "Flagged for review" },
    { shape: "circle", color: MARKER_COLORS.reviewed, label: "Reviewed" },
    { shape: "square", color: MARKER_COLORS.received, label: "Report: received" },
    { shape: "square", color: MARKER_COLORS.investigating, label: "Report: investigating" },
    { shape: "square", color: MARKER_COLORS.resolved, label: "Report: resolved" },
  ];
  return (
    <div className="absolute bottom-3 left-3 z-[1000] rounded-md border bg-card/95 px-3 py-2 shadow-sm">
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-xs">
            <span className={cn("size-3 border-2 border-white shadow-sm", i.shape === "circle" ? "rounded-full" : "rounded-[3px]")} style={{ backgroundColor: i.color }} aria-hidden />
            {i.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-xs">
          <span className="flex size-4 items-center justify-center rounded-full bg-navy text-[9px] font-semibold text-navy-foreground" aria-hidden>
            1
          </span>
          Hotspot rank
        </li>
      </ul>
    </div>
  );
}
