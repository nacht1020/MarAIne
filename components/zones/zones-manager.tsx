"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Info, Loader2, MapPinned, PenLine, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteZone, saveZone } from "@/app/admin/zones/actions";
import { EmptyState } from "@/components/data/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ZoneType, ZoneWithGeoJson } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PolygonGeometry } from "@/lib/validation/zone";
import { ZONE_COLORS, ZONE_LABELS } from "@/lib/zones/geo";
import { NEW_ZONE_KEY, ZONE_ICONS, ZONE_TYPES, ZoneActiveStatus, ZoneTypeBadge } from "./zone-type";

const ZoneMap = dynamic(() => import("./zone-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

type FormState = { name: string; type: ZoneType; reason: string; active: boolean };

const EMPTY_FORM: FormState = { name: "", type: "restricted", reason: "", active: true };

function formFrom(zone: ZoneWithGeoJson): FormState {
  return { name: zone.name ?? "", type: zone.type ?? "restricted", reason: zone.reason ?? "", active: zone.active ?? true };
}

export function ZonesManager({ zones }: { zones: ZoneWithGeoJson[] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [newGeometry, setNewGeometry] = useState<PolygonGeometry | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [editingShape, setEditingShape] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Edited outline lives in a ref: updating state on every vertex drag would redraw the layer mid-edit.
  const shape = useRef<PolygonGeometry | null>(null);

  const isNew = selectedKey === NEW_ZONE_KEY;
  const selectedZone = zones.find((z) => z.id === selectedKey) ?? null;
  const busy = saving || refreshing;

  const sortedZones = useMemo(
    () =>
      [...zones].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          ZONE_TYPES.indexOf(a.type!) - ZONE_TYPES.indexOf(b.type!) ||
          (a.name ?? "").localeCompare(b.name ?? ""),
      ),
    [zones],
  );
  const counts = useMemo(() => {
    const c = { restricted: 0, safe: 0, sanctuary: 0, pollution: 0 } as Record<ZoneType, number>;
    for (const z of zones) if (z.type && z.active) c[z.type] += 1;
    return c;
  }, [zones]);

  function guardUnsaved() {
    if (!dirty) return false;
    toast.warning("Save or cancel your changes to this zone first.");
    return true;
  }

  function select(id: string) {
    if (id === selectedKey || guardUnsaved()) return;
    const zone = zones.find((z) => z.id === id);
    if (!zone) return;
    setDrawing(false);
    setNewGeometry(null);
    setEditingShape(false);
    setSelectedKey(id);
    setForm(formFrom(zone));
    shape.current = null;
    setError("");
  }

  function startDrawing() {
    if (guardUnsaved()) return;
    setSelectedKey(null);
    setNewGeometry(null);
    setEditingShape(false);
    setError("");
    setDrawing(true);
  }

  function handleDrawn(geometry: PolygonGeometry) {
    setDrawing(false);
    setNewGeometry(geometry);
    shape.current = geometry;
    setSelectedKey(NEW_ZONE_KEY);
    setForm(EMPTY_FORM);
    setDirty(true);
  }

  function handleShapeChange(geometry: PolygonGeometry) {
    shape.current = geometry;
    setDirty(true);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  function close() {
    setSelectedKey(null);
    setNewGeometry(null);
    setEditingShape(false);
    setDirty(false);
    setError("");
    shape.current = null;
  }

  function cancelChanges() {
    if (isNew || !selectedZone) return close();
    setForm(formFrom(selectedZone));
    setEditingShape(false);
    setDirty(false);
    setError("");
    shape.current = null;
    setResetKey((k) => k + 1);
  }

  async function save() {
    const geometry = shape.current ?? (selectedZone?.geojson as PolygonGeometry | undefined);
    if (!geometry) return;
    setSaving(true);
    setError("");
    const result = await saveZone({ id: isNew ? null : selectedKey, ...form, geometry });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(isNew ? `Zone "${form.name}" created` : `Zone "${form.name}" saved`);
    setEditingShape(false);
    setDirty(false);
    shape.current = null;
    if (isNew && result.id) {
      setNewGeometry(null);
      setSelectedKey(result.id);
    }
    startRefresh(() => router.refresh());
  }

  async function remove() {
    if (!selectedZone?.id) return;
    setSaving(true);
    const result = await deleteZone(selectedZone.id);
    setSaving(false);
    setConfirmDelete(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Zone "${selectedZone.name}" deleted`);
    close();
    startRefresh(() => router.refresh());
  }

  const panelOpen = selectedKey !== null;

  return (
    <div className="grid gap-4 lg:h-[calc(100vh-10.5rem)] lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="relative h-[55vh] overflow-hidden rounded-lg border lg:h-full">
        <ZoneMap
          zones={zones}
          selectedKey={selectedKey}
          newGeometry={newGeometry}
          selectedStyle={panelOpen ? { type: form.type, active: form.active } : null}
          drawing={drawing}
          editingShape={editingShape || isNew}
          resetKey={resetKey}
          onSelect={select}
          onDrawn={handleDrawn}
          onDrawStop={() => setDrawing(false)}
          onShapeChange={handleShapeChange}
        />
        <Legend counts={counts} />
        {drawing && (
          <div className="absolute inset-x-3 top-3 z-[1000] flex items-center gap-3 rounded-md border bg-card/95 px-3 py-2 text-sm shadow-sm">
            <PenLine className="size-4 shrink-0 text-teal" aria-hidden />
            <p className="flex-1">Click the map to place corners. Click the first corner to close the shape.</p>
            <Button size="sm" variant="ghost" onClick={() => setDrawing(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      <aside className="flex min-h-0 flex-col rounded-lg border bg-card" aria-label="Zone details">
        {panelOpen ? (
          <ZoneForm
            isNew={isNew}
            form={form}
            zone={selectedZone}
            dirty={dirty}
            busy={busy}
            saving={saving}
            error={error}
            editingShape={editingShape || isNew}
            onChange={update}
            onToggleShape={() => setEditingShape((v) => !v)}
            onSave={save}
            onCancel={cancelChanges}
            onBack={() => !guardUnsaved() && close()}
            onDelete={() => setConfirmDelete(true)}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Zones</h2>
                <p className="text-xs text-muted-foreground tabular">
                  {zones.length} total · {zones.filter((z) => z.active).length} active
                </p>
              </div>
              <Button size="sm" onClick={startDrawing} disabled={drawing}>
                <Plus className="mr-1.5 size-4" /> Draw zone
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {zones.length === 0 ? (
                <EmptyState
                  className="m-4"
                  icon={MapPinned}
                  title="No zones yet"
                  description="Draw restricted areas, sanctuaries, safe fishing grounds and pollution advisories on the map."
                />
              ) : (
                <ul className="divide-y">
                  {sortedZones.map((zone) => (
                    <li key={zone.id}>
                      <button
                        type="button"
                        onClick={() => zone.id && select(zone.id)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      >
                        <span
                          className="mt-1 size-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: ZONE_COLORS[zone.type!], opacity: zone.active ? 1 : 0.4 }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block truncate text-sm font-medium">{zone.name}</span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <ZoneTypeBadge type={zone.type!} />
                            <ZoneActiveStatus active={zone.active ?? false} />
                            <span className="text-xs text-muted-foreground tabular">{formatArea(zone.area_ha)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="flex gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Zone changes apply to new catch logs. Logs already recorded keep the check made when they were logged.
            </p>
          </>
        )}
      </aside>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{selectedZone?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Past catch logs keep their status but lose the link to this zone. To pause a zone and keep its history, turn
              it inactive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep zone</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete zone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type ZoneFormProps = {
  isNew: boolean;
  form: FormState;
  zone: ZoneWithGeoJson | null;
  dirty: boolean;
  busy: boolean;
  saving: boolean;
  error: string;
  editingShape: boolean;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onToggleShape: () => void;
  onSave: () => void;
  onCancel: () => void;
  onBack: () => void;
  onDelete: () => void;
};

function ZoneForm({
  isNew,
  form,
  zone,
  dirty,
  busy,
  saving,
  error,
  editingShape,
  onChange,
  onToggleShape,
  onSave,
  onCancel,
  onBack,
  onDelete,
}: ZoneFormProps) {
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="flex items-center gap-2 border-b px-2 py-2">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Back to all zones">
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="flex-1 truncate text-sm font-semibold">{isNew ? "New zone" : zone?.name}</h2>
        {dirty && <span className="mr-2 text-xs font-medium text-warning">Unsaved changes</span>}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="zone-name">Name</Label>
          <Input
            id="zone-name"
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="e.g. Maniwaya spawning area"
            autoFocus={isNew}
            maxLength={80}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zone-type">Type</Label>
          <Select value={form.type} onValueChange={(v) => onChange("type", v as ZoneType)}>
            <SelectTrigger id="zone-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ZONE_TYPES.map((type) => {
                const Icon = ZONE_ICONS[type];
                return (
                  <SelectItem key={type} value={type}>
                    <span className="flex items-center gap-2">
                      <Icon className="size-4" style={{ color: ZONE_COLORS[type] }} aria-hidden />
                      {ZONE_LABELS[type]}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{TYPE_HELP[form.type]}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="zone-reason">Reason</Label>
          <Textarea
            id="zone-reason"
            value={form.reason}
            onChange={(e) => onChange("reason", e.target.value)}
            placeholder="Why this zone exists, e.g. the ordinance or advisory it comes from."
            rows={3}
            maxLength={300}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-3">
          <div className="space-y-0.5">
            <Label htmlFor="zone-active">Active</Label>
            <p className="text-xs text-muted-foreground">Inactive zones stay on the map but are not checked on new logs.</p>
          </div>
          <Switch id="zone-active" checked={form.active} onCheckedChange={(v) => onChange("active", v)} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Shape</p>
          {isNew ? (
            <p className="text-xs text-muted-foreground">Drag the corner handles on the map to adjust the outline before saving.</p>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onToggleShape} className={cn(editingShape && "border-teal text-teal")}>
              <PenLine className="mr-1.5 size-4" />
              {editingShape ? "Editing outline: drag the corners" : "Edit outline"}
            </Button>
          )}
          {zone?.area_ha != null && !isNew && (
            <p className="text-xs text-muted-foreground tabular">Saved area: {formatArea(zone.area_ha)}</p>
          )}
        </div>

        {error && (
          <p role="alert" className="flex gap-2 rounded-md bg-coral-soft px-3 py-2 text-sm text-coral">
            <X className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t px-4 py-3">
        {!isNew && (
          <Button type="button" variant="ghost" size="icon" onClick={onDelete} disabled={busy} aria-label="Delete zone" className="text-coral hover:bg-coral-soft hover:text-coral">
            <Trash2 className="size-4" />
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy || (!dirty && !isNew)}>
            {isNew ? "Discard" : "Cancel"}
          </Button>
          <Button type="submit" disabled={busy || !dirty}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isNew ? "Create zone" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

const TYPE_HELP: Record<ZoneType, string> = {
  restricted: "Catches logged inside are flagged for review.",
  sanctuary: "No-take area. Catches logged inside are flagged for review.",
  safe: "Open fishing ground. Catches inside are not flagged.",
  pollution: "Catches inside carry a pollution advisory but are not flagged.",
};

function Legend({ counts }: { counts: Record<ZoneType, number> }) {
  return (
    <div className="absolute bottom-3 left-3 z-[1000] rounded-md border bg-card/95 px-3 py-2 shadow-sm">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Active zones</p>
      <ul className="space-y-1">
        {ZONE_TYPES.map((type) => {
          const Icon = ZONE_ICONS[type];
          return (
            <li key={type} className="flex items-center gap-2 text-xs">
              <Icon className="size-3.5" style={{ color: ZONE_COLORS[type] }} aria-hidden />
              <span className="flex-1">{ZONE_LABELS[type]}</span>
              <span className="tabular text-muted-foreground">{counts[type]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatArea(ha: number | null | undefined) {
  if (ha == null) return "";
  return ha >= 100 ? `${(ha / 100).toLocaleString("en-PH", { maximumFractionDigits: 1 })} km²` : `${ha.toLocaleString("en-PH")} ha`;
}
