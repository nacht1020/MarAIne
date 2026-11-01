import type { PostgrestError } from '@supabase/supabase-js';

import type { CatchRecord, CatchServer, CatchStatus, ReportRecord } from '@/storage/records';

import { supabase } from './supabase';

// One record at a time against the same tables and RLS the web app uses. Triggers on the server
// set status, flags and zone; the phone only sends what the fisher entered.

export class Transient extends Error {}

// SQLSTATE classes that will fail the same way on every retry: bad data, a broken constraint,
// or a permission check. Everything else (no signal, timeouts, expired token) is retried.
function isPermanent(error: PostgrestError) {
  return /^(22|23|42)[0-9A-Z]{3}$/.test(error.code ?? '');
}

function fail(error: PostgrestError): never {
  if (isPermanent(error)) throw new Error(error.message || 'The server did not accept this record.');
  throw new Transient(error.message);
}

const point = (r: { location: { lat: number; lng: number } | null }) =>
  r.location ? `SRID=4326;POINT(${r.location.lng} ${r.location.lat})` : null;

const CATCH_COLUMNS = 'id, status, flag_reasons, qr_token';

const toServer = (row: { id: string; status: string; flag_reasons: string[] | null; qr_token: string }): CatchServer => ({
  id: row.id,
  status: row.status as CatchStatus,
  flagReasons: row.flag_reasons ?? [],
  qrToken: row.qr_token,
});

let speciesIds: Map<string, string> | null = null;

// local_name -> species.id, fetched once per app run.
async function speciesId(localName: string): Promise<string> {
  if (!supabase) throw new Transient('offline');
  if (!speciesIds) {
    const { data, error } = await supabase.from('species').select('id, local_name');
    if (error) fail(error);
    speciesIds = new Map((data ?? []).map((s: { id: string; local_name: string }) => [s.local_name, s.id]));
  }
  const id = speciesIds.get(localName);
  // Shown as: "The server did not accept this catch: <this>. Please show it to the MAO."
  if (!id) throw new Error(`${localName} is not on the MAO's fish list yet, so the MAO needs to add it first`);
  return id;
}

export async function sendCatch(c: CatchRecord, userId: string): Promise<CatchServer> {
  if (!supabase) throw new Transient('offline');
  const { data, error } = await supabase
    .from('catches')
    .insert({
      client_uuid: c.clientUuid,
      fisher_id: userId,
      logged_by: userId,
      source: 'app',
      species_id: await speciesId(c.speciesLocalName),
      weight_kg: c.weightKg,
      size_cm: c.sizeCm,
      caught_at: c.caughtAt,
      recorded_at: c.recordedAt,
      geom: point(c),
    })
    .select(CATCH_COLUMNS)
    .single();

  if (!error) return toServer(data);
  // Already there: an earlier attempt reached the server but the reply was lost.
  if (error.code === '23505') {
    const existing = await supabase.from('catches').select(CATCH_COLUMNS).eq('client_uuid', c.clientUuid).single();
    if (existing.error) fail(existing.error);
    return toServer(existing.data);
  }
  fail(error);
}

// reports has no client_uuid column, so a reply lost mid-send could file it twice; rare, and the MAO can merge.
export async function sendReport(r: ReportRecord, userId: string): Promise<{ id: string }> {
  if (!supabase) throw new Transient('offline');
  const { data, error } = await supabase
    .from('reports')
    .insert({ reporter_id: userId, type: r.type, description: r.description, geom: point(r) })
    .select('id')
    .single();
  if (error) fail(error);
  return { id: data.id };
}

// The MAO may review a catch after it was sent; pull the latest status for sent ones.
export async function refreshCatchStatuses(ids: string[]): Promise<Map<string, CatchServer>> {
  if (!supabase || ids.length === 0) return new Map();
  const { data, error } = await supabase.from('catches').select(CATCH_COLUMNS).in('id', ids.slice(0, 200));
  if (error) fail(error);
  return new Map((data ?? []).map((row: Parameters<typeof toServer>[0]) => [row.id, toServer(row)]));
}
