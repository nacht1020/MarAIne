"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ClipboardCheck, CircleCheck, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { reviewCatch } from "@/app/admin/catches/actions";
import { CatchStatusBadge } from "@/components/catch/catch-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { FLAG_REASONS, flagLabel, isFlagReason } from "@/lib/catch/flags";
import { CATCH_STATUS_LABELS } from "@/lib/catch/status";
import { formatNumber } from "@/lib/format";
import type { CatchDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AiAssistedTag, SourceLabel, isAiAssisted } from "./catch-cells";

export function formatDateTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export function CatchDetailSheet({ row, onOpenChange }: { row: CatchDetail | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {row && <Detail key={row.id} row={row} />}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ row }: { row: CatchDetail }) {
  const reasons = row.flag_reasons ?? [];
  const lateHours = row.caught_at && row.logged_at ? (Date.parse(row.logged_at) - Date.parse(row.caught_at)) / 3_600_000 : 0;

  return (
    <>
      <SheetHeader className="space-y-2 border-b px-6 py-4 text-left">
        <div className="flex items-start justify-between gap-4 pr-6">
          <div>
            <SheetTitle className="text-lg">
              {row.species_local_name} <span className="text-sm font-normal text-muted-foreground">{row.species_english_name}</span>
            </SheetTitle>
            <SheetDescription>
              {formatNumber(Number(row.weight_kg), 1)} kg{row.size_cm ? ` · ${formatNumber(Number(row.size_cm), 1)} cm` : ""} · caught{" "}
              {formatDateTime(row.caught_at)}
            </SheetDescription>
          </div>
        </div>
        {row.status && <CatchStatusBadge status={row.status} className="w-fit" />}
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {reasons.length > 0 && (
          <section aria-labelledby="flags-heading" className="space-y-2">
            <h3 id="flags-heading" className="text-sm font-semibold">
              Why this log is flagged for review
            </h3>
            <ul className="space-y-2">
              {reasons.map((code) => (
                <li key={code} className="rounded-md border border-coral/30 bg-coral-soft px-3 py-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {flagLabel(code)}
                    {isAiAssisted(code) && <AiAssistedTag />}
                  </p>
                  {isFlagReason(code) && <p className="text-xs text-muted-foreground">{FLAG_REASONS[code].detail}</p>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Flags are prompts to check, not findings. Confirm with the fisher before any action.</p>
          </section>
        )}

        <section aria-label="Catch details">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm">
            <Fact label="Fisher">
              {row.fisher_name}
              <span className="block text-xs text-muted-foreground">
                {[row.fishr_no, row.barangay, row.municipality].filter(Boolean).join(" · ")}
              </span>
            </Fact>
            <Fact label="Boat">
              {row.boat_name ? (
                <>
                  {row.boat_name}
                  <span className="block text-xs text-muted-foreground">
                    {[row.boatr_no, row.gross_tons ? `${row.gross_tons} gross tons` : null].filter(Boolean).join(" · ")}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </Fact>
            <Fact label="Source">{row.source && <SourceLabel source={row.source} />}</Fact>
            <Fact label="Logged">
              {formatDateTime(row.logged_at)}
              {lateHours > 48 && (
                <span className="block text-xs text-muted-foreground">
                  {Math.round(lateHours)} hours after the catch.
                  {row.late_entry_reason ? ` Reason given: "${row.late_entry_reason}"` : " No reason given."}
                </span>
              )}
            </Fact>
            <Fact label="Location">
              {row.lat !== null && row.lng !== null ? (
                <span className="inline-flex items-center gap-1 tabular">
                  <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
                  {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
                </span>
              ) : (
                <span className="text-muted-foreground">No location (logged by SMS)</span>
              )}
              <span className="block text-xs text-muted-foreground">
                {row.zone_name ?? "Outside any zone"}. Exact coordinates are shown to admins only.
              </span>
            </Fact>
          </dl>
        </section>

        {(row.admin_note || row.reviewed_at) && (
          <section aria-labelledby="history-heading" className="space-y-1.5 rounded-md bg-muted px-3 py-2.5">
            <h3 id="history-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Last review
            </h3>
            {row.admin_note && <p className="text-sm">{row.admin_note}</p>}
            {row.reviewed_at && <p className="text-xs text-muted-foreground">{formatDateTime(row.reviewed_at)}</p>}
          </section>
        )}
      </div>

      <ReviewForm row={row} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function ReviewForm({ row }: { row: CatchDetail }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [status, setStatus] = useState<"reviewed" | "verified">(row.status === "flagged" ? "reviewed" : "verified");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError("");
  }, [status, note]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await reviewCatch({ id: row.id, status, note });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Marked ${CATCH_STATUS_LABELS[status].label.toLowerCase()}`);
    setNote("");
    startRefresh(() => router.refresh());
  }

  const options = [
    { value: "reviewed" as const, icon: ClipboardCheck, label: "Reviewed", help: "Checked; keep the flag on record." },
    { value: "verified" as const, icon: CircleCheck, label: "Verified", help: "Checked and confirmed as fine." },
  ];

  return (
    <form onSubmit={submit} className="space-y-3 border-t bg-card px-6 py-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Review this log</legend>
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer gap-2 rounded-md border px-3 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                status === o.value ? "border-teal bg-teal-soft" : "hover:bg-muted/60",
              )}
            >
              <input type="radio" name="review-status" value={o.value} checked={status === o.value} onChange={() => setStatus(o.value)} className="sr-only" />
              <o.icon className={cn("mt-0.5 size-4 shrink-0", status === o.value ? "text-teal" : "text-muted-foreground")} aria-hidden />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="review-note">Note</Label>
        <Textarea
          id="review-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="What was checked, e.g. confirmed location with the fisher at Laylay port."
          aria-invalid={!!error}
          aria-describedby={error ? "review-error" : undefined}
        />
        {error && (
          <p id="review-error" className="text-sm text-coral">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={saving || refreshing}>
        {(saving || refreshing) && <Loader2 className="mr-2 size-4 animate-spin" />}
        Mark as {CATCH_STATUS_LABELS[status].label.toLowerCase()}
      </Button>
    </form>
  );
}
