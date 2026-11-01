import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/data/states";
import { HotspotsView } from "@/components/hotspots/hotspots-view";
import { addDays, todayInManila } from "@/lib/analytics/overview";
import { PERIOD_OPTIONS, computeHotspots, type Incident, type PeriodDays } from "@/lib/analytics/hotspots";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hotspots" };

export default async function HotspotsPage({ searchParams }: { searchParams: { days?: string; reviewed?: string } }) {
  const days: PeriodDays = PERIOD_OPTIONS.find((d) => String(d) === searchParams.days) ?? 60;
  const includeReviewed = searchParams.reviewed === "1";
  const since = `${addDays(todayInManila(), -(days - 1))}T00:00:00+08:00`;
  const statuses = includeReviewed ? ["flagged", "reviewed"] : ["flagged"];

  const supabase = createClient();
  const [catches, reports, zones] = await Promise.all([
    supabase
      .from("catch_details")
      .select("id, lat, lng, caught_at, status, species_local_name, fisher_name, flag_reasons, zone_name")
      .in("status", statuses as ("flagged" | "reviewed")[])
      .gte("caught_at", since)
      .limit(5000),
    supabase.from("report_details").select("id, lat, lng, created_at, status, type, description").not("lat", "is", null).gte("created_at", since).limit(5000),
    supabase.from("zones_geojson").select("*"),
  ]);

  const header = (
    <PageHeader
      title="Hotspots"
      description="Where flagged catch logs and community reports cluster. Use it to plan patrols and follow-ups with Bantay Dagat."
    />
  );
  const error = catches.error ?? reports.error ?? zones.error;
  if (error) {
    return (
      <>
        {header}
        <ErrorState title="Could not load hotspot data" description={error.message} />
      </>
    );
  }

  const incidents: Incident[] = [];
  let unmappedFlagged = 0;
  for (const c of catches.data ?? []) {
    if (c.lat === null || c.lng === null) {
      unmappedFlagged += 1;
      continue;
    }
    incidents.push({
      kind: "catch",
      id: c.id!,
      lat: c.lat,
      lng: c.lng,
      at: c.caught_at!,
      status: c.status!,
      species: c.species_local_name!,
      fisher: c.fisher_name ?? "Unknown fisher",
      reasons: c.flag_reasons ?? [],
      zoneName: c.zone_name,
    });
  }
  for (const r of reports.data ?? []) {
    incidents.push({
      kind: "report",
      id: r.id!,
      lat: r.lat!,
      lng: r.lng!,
      at: r.created_at!,
      status: r.status!,
      type: r.type!,
      description: r.description ?? "",
    });
  }

  return (
    <>
      {header}
      <HotspotsView
        hotspots={computeHotspots(incidents)}
        zones={zones.data ?? []}
        days={days}
        includeReviewed={includeReviewed}
        unmappedFlagged={unmappedFlagged}
      />
    </>
  );
}
