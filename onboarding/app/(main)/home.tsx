import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, CatchRow, ConditionsCard, EmptyState, IconBadge, QuickAction, ScreenContainer, SyncBanner, SyncChip, TextLink } from '@/components';
import { ConditionsGrid, conditionsSummary } from '@/components/ConditionsGrid';
import { moodInk, WeatherScene } from '@/components/WeatherScene';
import { SeaweedGrowth } from '@/components/SeaweedGrowth';
import { cycleStage, daysSince, getCrop, parsePlot } from '@/constants/aquaculture';
import { getMunicipality } from '@/constants/municipalities';
import { getReportType } from '@/constants/reportTypes';
import { actionsFor } from '@/constants/roleNav';
import { PLACES } from '@/constants/places';
import { getRole } from '@/constants/roles';
import { MOOD_LOOK, MOODS, moodOf, skyOf, type Mood } from '@/constants/weather';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useRecords } from '@/hooks/useRecords';
import { useSeaConditions } from '@/hooks/useSeaConditions';
import { useSync } from '@/hooks/useSync';
import { AlertsBell } from '@/components/Alerts';
import { useLanguage } from '@/hooks/useLanguage';
import { useUsername } from '@/hooks/useUsername';
import { useLocalList } from '@/storage/localList';
import { fonts, useTheme } from '@/theme';

function greeting(t: (en: string, fil: string) => string) {
  const h = new Date().getHours();
  if (h < 12) return t('Good morning', 'Magandang umaga');
  if (h < 18) return t('Good afternoon', 'Magandang hapon');
  return t('Good evening', 'Magandang gabi');
}

export default function HomeScreen() {
  const router = useRouter();
  const { colors, spacing, radii } = useTheme();
  const { state } = useOnboarding();
  const { auth } = useAuth();
  const { syncNow } = useSync();
  const username = useUsername();
  const { t } = useLanguage();
  const firstName = username ?? (auth.status === 'signedIn' ? auth.profile?.fullName.trim().split(/\s+/)[0] : undefined);
  const town = state.municipality ? getMunicipality(state.municipality) : undefined;
  const role = state.role ? getRole(state.role) : undefined;
  const { state: sea, refreshing, refresh } = useSeaConditions(town);

  const place = town ? [state.barangay.trim(), town.name].filter(Boolean).join(', ') : 'Marinduque';
  const waveHeight = sea.status === 'ready' ? sea.data.waveHeightM : null;

  const insets = useSafeAreaInsets();
  // null = follow the live weather; a mood = preview chosen with the chips.
  const [preview, setPreview] = useState<(typeof MOODS)[number] | null>(null);
  const data = sea.status === 'ready' ? sea.data : null;
  const liveMood: Mood = data ? moodOf(data) : new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'sunny' : 'night';
  const mood: Mood = preview ?? liveMood;
  const ink = moodInk(mood);
  const sky = data ? skyOf(data.weatherCode, data.isDay) : null;
  const condition = preview ? `${MOOD_LOOK[preview].label} (preview)` : sky ? t(sky.en, sky.tl) : sea.status === 'loading' ? t('Loading the forecast…', 'Kinukuha ang taya ng panahon…') : t('Forecast unavailable', 'Walang makuhang taya');
  const heroHeight = 510 + insets.top;

  return (
    <ScreenContainer
      padded={false}
      edges={['left', 'right']}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            refresh();
            syncNow();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <WeatherScene mood={mood} waveHeightM={waveHeight} height={heroHeight}>
        <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.xs }}>
          <View style={styles.row}>
            <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: radii.pill, gap: 6 }]}>
              <MaterialCommunityIcons name="map-marker" size={16} color={colors.selected} />
              <AppText variant="label" numberOfLines={1}>
                {place}
              </AppText>
            </View>
            <View style={styles.flex} />
            <AlertsBell />
            <View style={{ width: 8 }} />
            <RefreshButton spinning={refreshing} onPress={refresh} />
          </View>

          <Animated.View entering={FadeInDown.duration(360)} style={{ marginTop: spacing.md }}>
            <AppText variant="label" style={{ color: ink, opacity: 0.85 }}>
              {firstName ? `${greeting(t)}, ${firstName}` : greeting(t)}
              {role ? ` · ${t(role.title, role.titleFil)}` : ''}
            </AppText>
            <View style={styles.tempRow} accessible accessibilityLabel={`${data?.tempC == null ? 'Temperature unknown' : `${Math.round(data.tempC)} degrees`}, ${condition}`}>
              <AppText style={[styles.temp, { color: ink }]}>{data?.tempC == null ? '--' : Math.round(data.tempC)}</AppText>
              <AppText variant="heading" style={{ color: ink, marginTop: 14 }}>
                °C
              </AppText>
            </View>
            <Animated.View key={condition} entering={FadeIn.duration(250)}>
              <AppText variant="heading" style={{ color: ink }}>
                {condition}
              </AppText>
            </Animated.View>
          </Animated.View>

          <MoodChips value={preview} onChange={setPreview} />
        </View>
      </WeatherScene>

      <View style={[styles.sheet, { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: spacing.lg, gap: spacing.md }]}>
        <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
        <View style={[styles.row, { gap: spacing.sm }]}>
          <AppText variant="title" accessibilityRole="header" style={styles.flex}>
            {"Today's conditions"}
          </AppText>
          {data ? <LivePill stale={sea.status === 'ready' && sea.stale} /> : null}
        </View>
        {data ? (
          <AppText variant="caption" color="textMuted" style={{ marginTop: -spacing.sm }}>
            {new Date().toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })} · {conditionsSummary(data)}
          </AppText>
        ) : null}

        {data ? <ConditionsGrid data={data} /> : <ConditionsCard townName={town?.name ?? 'your town'} state={sea} refreshing={refreshing} onRetry={refresh} />}

        <AppText variant="caption" color="textMuted">
          Forecast by Open-Meteo (a weather model, updated every 15 minutes). For storm warnings, follow PAGASA.
        </AppText>

        <SyncBanner />
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
      <Section title="What do you need?">
        <View style={[styles.grid, { gap: spacing.sm }]}>
          {actionsFor(state.role).map((a) => (
            <QuickAction key={a.key} icon={a.icon} tone={a.tone} label={a.label} hint={a.hint} onPress={() => router.push(a.href)} />
          ))}
        </View>
      </Section>

      <RoleSection />
      </View>
    </ScreenContainer>
  );
}

// The bottom of Home follows the role: what this person checks most after the sea.
function RoleSection() {
  const { state } = useOnboarding();
  switch (state.role) {
    case 'aquaculture':
      return <FarmSummary />;
    case 'bantay-dagat':
    case 'community':
      return <RecentReports />;
    case 'tourist':
      return <PlacesPreview />;
    default:
      return <RecentCatches />;
  }
}

function useCard() {
  const { colors, radii } = useTheme();
  return [styles.card, { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: colors.surface }];
}

function Row({ first, children }: { first: boolean; children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: colors.borderStrong,
      }}
    >
      {children}
    </View>
  );
}

function SeeAll({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong }}>
      <TextLink label={label} onPress={onPress} />
    </View>
  );
}

function RecentCatches() {
  const router = useRouter();
  const card = useCard();
  const { catches } = useRecords();
  const recent = catches.slice(0, 3);
  return (
    <Section title="Recent catches">
      {recent.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          body="Your catches will show here, newest first, even before they are sent."
          action={<Button label="Log your first catch" variant="secondary" trailingIcon="arrow-forward" onPress={() => router.push('/log')} />}
        />
      ) : (
        <View style={card}>
          {recent.map((c, i) => (
            <Row key={c.clientUuid} first={i === 0}>
              <CatchRow record={c} />
            </Row>
          ))}
          <SeeAll label={`See all ${catches.length}`} onPress={() => router.push('/catches')} />
        </View>
      )}
    </Section>
  );
}

function FarmSummary() {
  const router = useRouter();
  const card = useCard();
  const { tones } = useTheme();
  const { items: plots } = useLocalList('farm/v1', parsePlot);
  return (
    <Section title="Your lines and cages">
      {plots.length === 0 ? (
        <EmptyState
          art={<SeaweedGrowth progress={0.6} width={140} />}
          title="No lines or cages yet"
          body="Add them on the Farm tab to see days since planting and harvest timing."
          action={<Button label="Open my farm" variant="secondary" trailingIcon="arrow-forward" onPress={() => router.push('/farm')} />}
        />
      ) : (
        <View style={card}>
          {plots.slice(0, 3).map((p, i) => {
            const stage = cycleStage(p);
            return (
              <Row key={p.id} first={i === 0}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <AppText variant="label">{p.name}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {getCrop(p.crop).name} · Day {daysSince(p.plantedAt)}
                    </AppText>
                  </View>
                  {stage ? (
                    <View style={[styles.row, { gap: 4 }]}>
                      <MaterialCommunityIcons name={stage.icon} size={16} color={tones[stage.tone].fg} />
                      <AppText variant="caption" style={{ color: tones[stage.tone].fg }}>
                        {stage.tone === 'reef' ? 'Growing' : stage.tone === 'mangrove' ? 'Ready' : 'Check'}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </Row>
            );
          })}
          <SeeAll label="Open my farm" onPress={() => router.push('/farm')} />
        </View>
      )}
    </Section>
  );
}

function RecentReports() {
  const router = useRouter();
  const card = useCard();
  const { reports } = useRecords();
  const recent = reports.slice(0, 3);
  return (
    <Section title="Your reports">
      {recent.length === 0 ? (
        <EmptyState
          title="No reports yet"
          body="Saw dynamite fishing, a commercial boat, or trash washing in? Report it, even without signal."
          action={<Button label="Make a report" variant="secondary" trailingIcon="arrow-forward" onPress={() => router.push('/report')} />}
        />
      ) : (
        <View style={card}>
          {recent.map((r, i) => (
            <Row key={r.clientUuid} first={i === 0}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <AppText variant="label">{getReportType(r.type).title}</AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {r.description}
                  </AppText>
                </View>
                <SyncChip sync={r.sync} />
              </View>
            </Row>
          ))}
          <SeeAll label="Make a report" onPress={() => router.push('/report')} />
        </View>
      )}
    </Section>
  );
}

function PlacesPreview() {
  const router = useRouter();
  const card = useCard();
  return (
    <Section title="Places to visit">
      <View style={card}>
        {PLACES.slice(0, 3).map((p, i) => (
          <Row key={p.id} first={i === 0}>
            <View style={[styles.row, { gap: 12 }]}>
              <IconBadge icon={p.icon} tone="reef" size="sm" />
              <View style={styles.flex}>
                <AppText variant="label">{p.name}</AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {p.about}
                </AppText>
              </View>
            </View>
          </Row>
        ))}
        <SeeAll label={`See all ${PLACES.length} places`} onPress={() => router.push('/places')} />
      </View>
    </Section>
  );
}

// Round refresh button over the sky; the icon turns while the forecast reloads.
function RefreshButton({ spinning, onPress }: { spinning: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (!spinning || reduce) return;
    r.value = 0;
    r.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [spinning, reduce, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }] }));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Refresh the forecast" hitSlop={8} style={[styles.round, { backgroundColor: 'rgba(255,255,255,0.85)' }]}>
      <Animated.View style={style}>
        <MaterialCommunityIcons name="refresh" size={22} color={colors.text} />
      </Animated.View>
    </Pressable>
  );
}

// "Live" follows the real weather; the icons preview how the scene looks in other weather. The highlight
// slides to the chosen chip (translateX and width, on the UI thread) instead of jumping.
function MoodChips({ value, onChange }: { value: (typeof MOODS)[number] | null; onChange: (m: (typeof MOODS)[number] | null) => void }) {
  const { colors, spacing, radii } = useTheme();
  const reduce = useReducedMotion();
  const keys = ['live', ...MOODS] as const;
  const layouts = useRef<Record<string, { x: number; w: number }>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const current = value ?? 'live';

  const moveTo = useCallback(
    (key: string, animate: boolean) => {
      const l = layouts.current[key];
      if (!l) return;
      const cfg = { duration: 260, easing: Easing.out(Easing.cubic) };
      x.value = animate && !reduce ? withTiming(l.x, cfg) : l.x;
      w.value = animate && !reduce ? withTiming(l.w, cfg) : l.w;
    },
    [x, w, reduce],
  );

  useEffect(() => moveTo(current, true), [current, moveTo]);

  const highlight = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.chips, { gap: 6, padding: 5, marginTop: spacing.md, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.72)' }]} accessibilityRole="radiogroup">
      <Animated.View pointerEvents="none" style={[styles.highlight, { borderRadius: radii.pill, backgroundColor: colors.selected }, highlight]} />
      {keys.map((k) => {
        const on = current === k;
        const ink = on ? colors.surface : colors.text;
        return (
          <Pressable
            key={k}
            onLayout={(e) => {
              layouts.current[k] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
              if (k === current) moveTo(k, false);
            }}
            onPress={() => onChange(k === 'live' || on ? null : k)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={k === 'live' ? 'Live weather' : `Preview: ${MOOD_LOOK[k].label}`}
            style={k === 'live' ? styles.liveChip : styles.moodChip}
          >
            {k === 'live' ? (
              <>
                <View style={[styles.dot, { backgroundColor: on ? colors.surface : colors.selected }]} />
                <AppText variant="caption" style={{ color: ink, fontFamily: fonts.sansBold }}>
                  Live
                </AppText>
              </>
            ) : (
              <MaterialCommunityIcons name={MOOD_LOOK[k].icon} size={20} color={ink} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function LivePill({ stale }: { stale: boolean }) {
  const { radii, tones } = useTheme();
  const t = stale ? tones.sea : tones.mangrove;
  return (
    <View style={[styles.pill, { gap: 5, borderRadius: radii.pill, backgroundColor: t.bg }]}>
      <MaterialCommunityIcons name={stale ? 'wifi-off' : 'access-point'} size={14} color={t.fg} />
      <AppText variant="caption" style={{ color: t.fg, fontFamily: fonts.sansBold }}>
        {stale ? 'Saved' : 'Live'}
      </AppText>
    </View>
  );
}

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: object }) {
  const { spacing } = useTheme();
  return (
    <View style={[{ gap: spacing.sm, marginTop: spacing.lg }, style]}>
      <AppText variant="eyebrow" color="textMuted" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderWidth: 1.5, overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', flexShrink: 1 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  tempRow: { flexDirection: 'row', alignItems: 'flex-start' },
  temp: { fontSize: 84, lineHeight: 92, fontFamily: fonts.sansBold, letterSpacing: -3, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  liveChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 36 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  moodChip: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  highlight: { position: 'absolute', left: 0, top: 5, height: 36 },
  sheet: { marginTop: -28, paddingTop: 10, paddingBottom: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
