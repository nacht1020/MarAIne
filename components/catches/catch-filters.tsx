"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MUNICIPALITIES } from "@/lib/analytics/overview";
import { NO_ZONE, type CatchFilters as Filters } from "@/lib/catch/query";
import { CATCH_STATUS_LABELS, CATCH_STATUS_ORDER } from "@/lib/catch/status";

type Option = { id: string; label: string };

export function CatchFilters({ filters, species, zones }: { filters: Filters; species: Option[]; zones: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);

  // Keep the box in sync when the top-bar search changes the URL.
  useEffect(() => {
    setQ(filters.q);
  }, [filters.q]);

  function push(update: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(update)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
  }

  const active = Boolean(filters.q || filters.status || filters.species || filters.zone || filters.municipality);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Filter catches">
      <form
        className="relative w-full sm:w-72"
        onSubmit={(e) => {
          e.preventDefault();
          push({ q });
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="catch-search" className="sr-only">
          Search catches
        </label>
        <Input
          id="catch-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => q !== filters.q && push({ q })}
          placeholder="Fisher or species"
          className="h-9 bg-card pl-8"
        />
      </form>

      <FilterSelect
        label="Status"
        value={filters.status}
        allLabel="All statuses"
        options={CATCH_STATUS_ORDER.map((s) => ({ id: s, label: CATCH_STATUS_LABELS[s].label }))}
        onChange={(v) => push({ status: v })}
      />
      <FilterSelect label="Species" value={filters.species} allLabel="All species" options={species} onChange={(v) => push({ species: v })} />
      <FilterSelect
        label="Zone"
        value={filters.zone}
        allLabel="All zones"
        options={[{ id: NO_ZONE, label: "Outside any zone" }, ...zones]}
        onChange={(v) => push({ zone: v })}
      />
      <FilterSelect
        label="Municipality"
        value={filters.municipality}
        allLabel="All municipalities"
        options={MUNICIPALITIES.map((m) => ({ id: m, label: m }))}
        onChange={(v) => push({ m: v })}
      />

      {active && (
        <Button variant="ghost" size="sm" onClick={() => push({ q: null, status: null, species: null, zone: null, m: null })}>
          <X className="mr-1 size-4" /> Clear filters
        </Button>
      )}
      {pending && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Updating
        </span>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  allLabel: string;
  options: Option[];
  onChange: (v: string | null) => void;
}) {
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? null : v)}>
      <SelectTrigger className="h-9 w-auto min-w-36 max-w-60 bg-card" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
