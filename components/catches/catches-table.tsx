"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Fish } from "lucide-react";
import { CatchStatusBadge } from "@/components/catch/catch-status";
import { EmptyState } from "@/components/data/states";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE, type CatchFilters, type SortKey } from "@/lib/catch/query";
import { formatNumber } from "@/lib/format";
import type { CatchDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FlagSummary, SourceLabel } from "./catch-cells";
import { CatchDetailSheet } from "./catch-detail-sheet";

type Props = { rows: CatchDetail[]; total: number; filters: CatchFilters; initialOpenId?: string | null };

export function CatchesTable({ rows, total, filters, initialOpenId = null }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  // ?open=<id> (from AI-assisted checks) opens that log's review panel straight away.
  const [openId, setOpenId] = useState<string | null>(initialOpenId);

  function push(update: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(update)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
  }

  function sortBy(key: SortKey) {
    const desc = filters.sort === key ? !filters.desc : key === "caught_at" || key === "weight_kg";
    push({ sort: `${key}.${desc ? "desc" : "asc"}`, page: null });
  }

  const columns = useMemo<ColumnDef<CatchDetail>[]>(
    () => [
      {
        id: "caught_at",
        header: "Caught",
        cell: ({ row }) => {
          const [date, time] = splitDateTime(row.original.caught_at);
          return (
            <span className="block whitespace-nowrap tabular">
              {date}
              <span className="block text-xs text-muted-foreground">{time}</span>
            </span>
          );
        },
      },
      {
        id: "species_local_name",
        header: "Species",
        cell: ({ row }) => (
          <span className="block min-w-28">
            <span className="block font-medium">{row.original.species_local_name}</span>
            <span className="block text-xs text-muted-foreground">{row.original.species_english_name}</span>
          </span>
        ),
      },
      {
        id: "weight_kg",
        header: "Weight",
        cell: ({ row }) => (
          <span className="block whitespace-nowrap text-right tabular">
            {formatNumber(Number(row.original.weight_kg), 1)} kg
            <span className="block text-xs text-muted-foreground">
              {row.original.size_cm ? `${formatNumber(Number(row.original.size_cm), 1)} cm` : "No size"}
            </span>
          </span>
        ),
      },
      {
        id: "fisher_name",
        header: "Fisher",
        cell: ({ row }) => (
          <span className="block min-w-32">
            <span className="block">{row.original.fisher_name}</span>
            <span className="block text-xs text-muted-foreground">{row.original.municipality}</span>
          </span>
        ),
      },
      {
        id: "zone",
        header: "Zone",
        cell: ({ row }) =>
          row.original.zone_name ? (
            <span className="block max-w-36 truncate text-sm" title={row.original.zone_name}>
              {row.original.zone_name}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{row.original.lat === null ? "No location" : "Outside zones"}</span>
          ),
      },
      { id: "source", header: "Source", cell: ({ row }) => row.original.source && <SourceLabel source={row.original.source} /> },
      { id: "status", header: "Status", cell: ({ row }) => row.original.status && <CatchStatusBadge status={row.original.status} /> },
      {
        id: "flags",
        header: "Flags",
        cell: ({ row }) => (
          <span className="block w-52">
            <FlagSummary reasons={row.original.flag_reasons ?? []} />
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualSorting: true, manualPagination: true });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, filters.page * PAGE_SIZE);
  const sortable = new Set<string>(["caught_at", "species_local_name", "weight_kg", "fisher_name"]);
  const open = rows.find((r) => r.id === openId) ?? null;

  if (total === 0) {
    return (
      <EmptyState
        icon={Fish}
        title="No catches match these filters"
        description={filters.q ? `Nothing found for "${filters.q}". Try a fisher's name or a species.` : "Try clearing a filter."}
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const key = header.column.id;
                  const active = filters.sort === key;
                  const numeric = key === "weight_kg";
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={active ? (filters.desc ? "descending" : "ascending") : undefined}
                      className={cn("whitespace-nowrap px-3 py-2.5 text-xs font-medium text-muted-foreground", numeric ? "text-right" : "text-left")}
                    >
                      {sortable.has(key) ? (
                        <button
                          type="button"
                          onClick={() => sortBy(key as SortKey)}
                          className={cn("inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "text-foreground")}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {active ? filters.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ArrowUpDown className="size-3 opacity-50" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => setOpenId(row.original.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenId(row.original.id);
                  }
                }}
                aria-label={`Open catch: ${row.original.species_local_name} by ${row.original.fisher_name}`}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                  row.original.status === "flagged" && "bg-coral-soft/40",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p className="tabular">
          Showing {from}–{to} of {formatNumber(total)} catch logs
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={filters.page <= 1} onClick={() => push({ page: String(filters.page - 1) })}>
            <ChevronLeft className="mr-1 size-4" /> Previous
          </Button>
          <span className="tabular">
            Page {filters.page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={filters.page >= pages} onClick={() => push({ page: String(filters.page + 1) })}>
            Next <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>

      <CatchDetailSheet row={open} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  );
}

/** ["Oct 28, 2026", "10:01 AM"] in Philippine time. */
function splitDateTime(iso: string | null) {
  if (!iso) return ["", ""];
  const d = new Date(iso);
  return [
    d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }),
    d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }),
  ];
}
