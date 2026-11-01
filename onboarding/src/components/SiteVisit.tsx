import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { getPlace } from '@/constants/places';
import { useLanguage } from '@/hooks/useLanguage';
import { checkIn, checkOut, useMinutesLeft, useVisit, type CheckInError, type SiteStatus } from '@/services/sites';
import { fonts, useTheme } from '@/theme';

import { AppText } from './AppText';

// Amber for "almost full" and "time almost up"; coral (accent) stays for full and over time.
const WARN = '#B7791F';

const hhmm = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`;
};

const duration = (mins: number, t: (en: string, fil: string) => string) =>
  mins >= 60 ? `${Math.floor(mins / 60)} ${t('h', 'oras')}${mins % 60 ? ` ${mins % 60} min` : ''}` : `${mins} min`;

// Visitor rules for one site, and the check-in that counts the visitor and starts the time limit.
// Promotes sustainable tourism: full sites refuse check-in, and the timer asks people to make room.
export function SiteRules({ placeId, site, failed, onChanged }: { placeId: string; site: SiteStatus | undefined; failed: boolean; onChanged: () => void }) {
  const { colors: c, spacing, radii } = useTheme();
  const { t } = useLanguage();
  const visit = useVisit();
  const [party, setParty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CheckInError | null>(null);

  // No rules to show (no signal, or the site list is not set up yet): leave the card as it was.
  if (failed && !site) return null;
  if (!site) return <ActivityIndicator color={c.primary} />;

  const here = visit?.placeId === placeId;
  const full = site.capacity !== null && site.visitors_now >= site.capacity;
  const noRules = site.capacity === null && site.max_stay_minutes === null && !site.open_from && site.fee_php === null;
  const share = site.capacity ? Math.min(1, site.visitors_now / site.capacity) : 0;
  const tone = full ? c.accent : share >= 0.8 ? WARN : c.success;

  const doCheckIn = async () => {
    setBusy(true);
    setError(null);
    const r = await checkIn(placeId, party);
    setBusy(false);
    if (!r.ok) setError(r.error);
    onChanged();
  };
  const doCheckOut = async () => {
    setBusy(true);
    await checkOut();
    setBusy(false);
    onChanged();
  };

  const errorText: Record<CheckInError, string> = {
    full: t('This place is full right now. Please come back later or visit another beach.', 'Puno na ang lugar ngayon. Bumalik mamaya o pumunta sa ibang dalampasigan.'),
    closed: t('This place is closed right now.', 'Sarado ang lugar ngayon.'),
    offline: t('No signal. Try again when you are online.', 'Walang signal. Subukan ulit kapag may internet.'),
    unavailable: t('Check-in is not available right now.', 'Hindi puwedeng mag-check in ngayon.'),
  };

  return (
    <View style={[styles.box, { borderRadius: radii.md, borderColor: c.border, padding: spacing.md, gap: spacing.sm }]}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <MaterialCommunityIcons name="account-group-outline" size={22} color={tone} />
        <View style={{ flex: 1 }}>
          <AppText variant="label">
            {site.capacity !== null
              ? `${site.visitors_now} / ${site.capacity} ${t('visitors now', 'bisita ngayon')}`
              : `${site.visitors_now} ${t('checked in now', 'naka-check in ngayon')}`}
          </AppText>
          <AppText variant="caption" style={{ color: tone }}>
            {full ? t('Full', 'Puno na') : site.capacity === null ? t('No official limit set yet', 'Wala pang opisyal na limit') : share >= 0.8 ? t('Almost full', 'Halos puno na') : t('Room for visitors', 'May puwang pa')}
          </AppText>
        </View>
      </View>
      {site.capacity !== null ? (
        <View style={[styles.track, { backgroundColor: c.surfaceMuted }]}>
          <View style={[styles.fill, { width: `${Math.round(share * 100)}%`, backgroundColor: tone }]} />
        </View>
      ) : null}

      {site.max_stay_minutes ? <Rule icon="timer-outline" text={`${t('Time limit', 'Limit ng oras')}: ${duration(site.max_stay_minutes, t)} ${t('per visit', 'bawat bisita')}`} /> : null}
      {site.open_from && site.open_to ? <Rule icon="clock-outline" text={`${t('Open', 'Bukas')} ${hhmm(site.open_from)} – ${hhmm(site.open_to)}`} /> : null}
      {site.fee_php !== null ? <Rule icon="cash" text={site.fee_php > 0 ? `${t('Fee', 'Bayad')}: ₱${Number(site.fee_php).toFixed(0)} ${t('per person', 'bawat tao')}` : t('No fee', 'Walang bayad')} /> : null}
      {site.notes ? <Rule icon="information-outline" text={site.notes} /> : null}
      {noRules ? (
        <AppText variant="caption" color="textMuted">
          {t('The local government has not posted limits for this place yet. Please keep groups small and do not stay too long.', 'Wala pang nakapaskil na limit ang lokal na pamahalaan para rito. Panatilihing maliit ang grupo at huwag magtagal.')}
        </AppText>
      ) : site.source ? (
        <AppText variant="caption" color="textMuted">
          {t('Source', 'Pinagmulan')}: {site.source}
        </AppText>
      ) : null}

      {here ? (
        <Pressable onPress={doCheckOut} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.btn, { borderRadius: radii.md, borderWidth: 1.5, borderColor: c.borderStrong, opacity: pressed || busy ? 0.7 : 1 }]}>
          <MaterialCommunityIcons name="exit-run" size={20} color={c.text} />
          <AppText variant="label">{t("I've left this place", 'Umalis na ako')}</AppText>
        </Pressable>
      ) : (
        <>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
              {t('People in your group', 'Ilan kayo sa grupo')}
            </AppText>
            <Step label="−" onPress={() => setParty((p) => Math.max(1, p - 1))} />
            <AppText variant="label" style={{ minWidth: 24, textAlign: 'center', fontFamily: fonts.sansBold }}>
              {party}
            </AppText>
            <Step label="+" onPress={() => setParty((p) => Math.min(50, p + 1))} />
          </View>
          <Pressable
            onPress={doCheckIn}
            disabled={busy || full}
            accessibilityRole="button"
            accessibilityHint={t('Counts you as a visitor here and starts the time limit', 'Bibilangin ka bilang bisita at sisimulan ang oras')}
            style={({ pressed }) => [styles.btn, { borderRadius: radii.md, backgroundColor: full ? c.surfaceMuted : c.primary, opacity: pressed || busy ? 0.8 : 1 }]}
          >
            {busy ? <ActivityIndicator color={c.textOnPrimary} /> : <MaterialCommunityIcons name="map-marker-check-outline" size={20} color={full ? c.textMuted : c.textOnPrimary} />}
            <AppText variant="label" style={{ color: full ? c.textMuted : c.textOnPrimary }}>
              {full ? t('Full right now', 'Puno ngayon') : t("I'm here: check in", 'Nandito ako: mag-check in')}
            </AppText>
          </Pressable>
        </>
      )}
      {error ? (
        <AppText variant="caption" style={{ color: c.accent }}>
          {errorText[error]}
        </AppText>
      ) : null}
    </View>
  );
}

function Rule({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.row, { gap: 8 }]}>
      <MaterialCommunityIcons name={icon} size={18} color={c.textMuted} />
      <AppText variant="caption" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label === '+' ? 'More people' : 'Fewer people'} hitSlop={6} style={[styles.step, { borderColor: c.border }]}>
      <AppText variant="label">{label}</AppText>
    </Pressable>
  );
}

// Shown on the map while the visitor is checked in somewhere: where, and the time left.
export function VisitBanner({ onOpen }: { onOpen: (placeId: string) => void }) {
  const { colors: c, radii, spacing } = useTheme();
  const { t } = useLanguage();
  const visit = useVisit();
  const left = useMinutesLeft(visit);
  if (!visit) return null;
  const over = left !== null && left <= 0;
  const soon = left !== null && left > 0 && left <= 15;
  const bg = over ? c.accent : soon ? WARN : c.primary;
  const name = getPlace(visit.placeId)?.name ?? visit.placeId;
  return (
    <Pressable onPress={() => onOpen(visit.placeId)} accessibilityRole="button" style={[styles.banner, { backgroundColor: bg, borderRadius: radii.md, marginHorizontal: spacing.md, marginBottom: spacing.sm }]}>
      <MaterialCommunityIcons name={over ? 'timer-alert-outline' : 'timer-sand'} size={20} color={c.textOnPrimary} />
      <AppText variant="caption" style={{ flex: 1, color: c.textOnPrimary, fontFamily: fonts.sansSemiBold }}>
        {over
          ? t(`Time is up at ${name}. Please make room for the next visitors.`, `Tapos na ang oras mo sa ${name}. Pakibigyan ng puwang ang susunod na bisita.`)
          : left !== null
            ? t(`At ${name} · ${left} min left`, `Nasa ${name} · ${left} minuto pa`)
            : t(`Checked in at ${name}`, `Naka-check in sa ${name}`)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  btn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  step: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
