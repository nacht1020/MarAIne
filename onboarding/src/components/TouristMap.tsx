import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { getMunicipality, MUNICIPALITIES, type MunicipalityId } from '@/constants/municipalities';
import { PLACES, getPlace, type Place, type PlaceKind } from '@/constants/places';
import townShapes from '@/data/marinduque-towns.json';
import { useLocationFix } from '@/hooks/useLocationFix';
import { useSeaConditions } from '@/hooks/useSeaConditions';
import { useSiteStatus } from '@/services/sites';
import { colors, fonts, useTheme } from '@/theme';

import { AppText } from './AppText';
import { SiteRules, VisitBanner } from './SiteVisit';
import { ConditionsCard } from './ConditionsCard';
import { LeafletMap } from './map/LeafletMap';
import type { LeafletMapHandle, MapData } from './map/types';

// The tourist's map: an illustrated Marinduque with each town in its own color (real NAMRIA/PSA
// boundaries) and pins for coastal places only. Tap a town to zoom in; tap a pin to see the place.

const NIGHT = '#0B2235';
const TEAL = '#19C3B3';

const TOWN_COLOR: Record<MunicipalityId, string> = {
  mogpog: '#2FBF71',
  'santa-cruz': '#F2C230',
  boac: '#3B82F6',
  gasan: '#F97316',
  buenavista: '#A855F7',
  torrijos: '#14B8A6',
};

const KIND_COLOR: Record<PlaceKind, string> = {
  island: '#E5484D',
  beach: '#E5484D',
  sandbar: '#E5484D',
  reef: '#E5484D',
  port: '#2563EB',
};

const townId = (name: string): MunicipalityId | undefined => MUNICIPALITIES.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;

// Distance in km, good enough for "nearest beach".
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

export function TouristMap() {
  const { colors: c, spacing, radii } = useTheme();
  const mapRef = useRef<LeafletMapHandle>(null);
  const location = useLocationFix();
  const [open, setOpen] = useState<Place | null>(null);
  const [town, setTown] = useState<MunicipalityId | null>(null);
  const [near, setNear] = useState<string | null>(null);

  const data = useMemo<MapData>(() => {
    const features = (townShapes as { features: { properties: { adm3_en: string }; geometry: unknown }[] }).features;
    return {
      mode: 'tourist',
      zones: [],
      catches: [],
      me: location.fix,
      towns: features.flatMap((f) => {
        const id = townId(f.properties.adm3_en);
        if (!id) return [];
        return [{ id, name: f.properties.adm3_en, color: TOWN_COLOR[id], count: PLACES.filter((p) => p.town === id).length, geometry: f.geometry }];
      }),
      places: PLACES.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, color: KIND_COLOR[p.kind] })),
    };
  }, [location.fix]);

  const [picked, setPicked] = useState<string | null>(null);
  const pickedPlace = picked ? getPlace(picked) : undefined;
  const reduce = useReducedMotion();

  // First tap on a place in the list zooms the map to it; a second tap opens its card.
  const focusPlace = (p: Place) => {
    if (picked === p.id) {
      setOpen(p);
      return;
    }
    setPicked(p.id);
    mapRef.current?.command({ type: 'focusPlace', id: p.id });
  };

  const pickTown = (id: MunicipalityId | null) => {
    setTown(id);
    setPicked(null);
    mapRef.current?.command(id ? { type: 'focusTown', id } : { type: 'home' });
  };

  const nearMe = () => {
    const fix = location.fix;
    if (!fix) {
      setNear('Finding you…');
      location.locate();
      return;
    }
    const best = [...PLACES].sort((a, b) => km(fix, a) - km(fix, b))[0];
    if (!best) return;
    const d = km(fix, best);
    if (d > 60) {
      setNear('You seem to be outside Marinduque. Here is the whole island.');
      pickTown(null);
      return;
    }
    setNear(null);
    mapRef.current?.command({ type: 'focusPlace', id: best.id });
    setOpen(best);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.flex, { backgroundColor: c.background }]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header">
          Discover <AppText variant="title" style={{ color: c.primary }}>MarAIne</AppText>
        </AppText>
        <AppText variant="caption" color="textMuted">
          Beaches and islands of Marinduque
        </AppText>
      </View>

      <VisitBanner onOpen={(id) => setOpen(getPlace(id) ?? null)} />
      <View style={[styles.mapBox, { marginHorizontal: spacing.md, borderRadius: radii.lg, borderColor: c.border }]}>
        <LeafletMap
          ref={mapRef}
          data={data}
          onPlacePress={(id) => setOpen(getPlace(id) ?? null)}
          onTownPress={(id) => setTown(id as MunicipalityId)}
          style={StyleSheet.absoluteFill}
        />
        {pickedPlace ? (
          <Animated.View key={pickedPlace.id} entering={reduce ? undefined : FadeIn.duration(250)} style={styles.peek}>
            <Pressable onPress={() => setOpen(pickedPlace)} accessibilityRole="button" accessibilityLabel={`${pickedPlace.name}. Open the place card`}>
              {pickedPlace.photo ? (
                <Image source={pickedPlace.photo.source} style={styles.peekImg} accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.peekImg, styles.thumbArt, { backgroundColor: TOWN_COLOR[pickedPlace.town] }]}>
                  <MaterialCommunityIcons name={pickedPlace.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={28} color={colors.white} />
                </View>
              )}
              <AppText variant="caption" numberOfLines={1} style={styles.peekName}>
                {pickedPlace.name}
              </AppText>
            </Pressable>
          </Animated.View>
        ) : null}
        <Pressable
          onPress={nearMe}
          accessibilityRole="button"
          accessibilityLabel="Near me"
          accessibilityHint="Opens the coastal place closest to you"
          style={({ pressed }) => [styles.fab, { backgroundColor: pressed ? c.surfaceMuted : c.surface, borderColor: c.border }]}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color={c.text} />
        </Pressable>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 96 }}>
        {near ? (
          <AppText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            {near}
          </AppText>
        ) : null}

        <View style={[styles.card, styles.row, { gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderColor: c.border, backgroundColor: c.surface }]}>
          <MaterialCommunityIcons name="gesture-tap" size={26} color={c.primary} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Tap a town, then a pin</AppText>
            <AppText variant="caption" color="textMuted">
              Or pick a place below. The map zooms to it; tap again to see photos and the sea today.
            </AppText>
          </View>
        </View>

        <AppText variant="eyebrow" color="textMuted">
          Towns
        </AppText>
        <View style={[styles.row, { gap: 8, flexWrap: 'wrap' }]}>
          <TownChip label="All" color={c.primary} on={town === null} onPress={() => pickTown(null)} />
          {MUNICIPALITIES.map((m) => (
            <TownChip key={m.id} label={m.name} color={TOWN_COLOR[m.id]} on={town === m.id} onPress={() => pickTown(m.id)} />
          ))}
        </View>

        <AppText variant="eyebrow" color="textMuted">
          Places to visit
        </AppText>
        <View style={[styles.card, { borderRadius: radii.lg, borderColor: c.border, backgroundColor: c.surface, overflow: 'hidden' }]}>
          {PLACES.filter((p) => !town || p.town === town).map((p, i) => {
            const on = picked === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => focusPlace(p)}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${p.kindLabel}`}
                accessibilityHint={on ? 'Opens the place card' : 'Zooms the map to this place'}
                style={({ pressed }) => [
                  styles.row,
                  { gap: spacing.md, padding: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: i ? 1 : 0, borderColor: c.border, backgroundColor: pressed || on ? c.surfaceMuted : 'transparent' },
                ]}
              >
                {p.photo ? (
                  <Image source={p.photo.source} style={styles.placeThumb} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.placeThumb, styles.thumbArt, { backgroundColor: TOWN_COLOR[p.town] }]}>
                    <MaterialCommunityIcons name={p.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={22} color={colors.white} />
                  </View>
                )}
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {p.name}
                  </AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {on ? 'Tap again to open' : `${p.kindLabel} · ${getMunicipality(p.town)?.name ?? ''}`}
                  </AppText>
                </View>
                <MaterialCommunityIcons name={on ? 'chevron-right' : 'map-marker-outline'} size={22} color={on ? c.primary : c.textMuted} />
              </Pressable>
            );
          })}
        </View>

        <AppText variant="caption" color="textMuted" style={{ textAlign: 'center', fontSize: 11 }}>
          Town boundaries: NAMRIA and PSA, via OCHA (CC BY-IGO). Place positions: OpenStreetMap.
        </AppText>
      </ScrollView>

      <PlaceSheet place={open} onClose={() => setOpen(null)} />
    </SafeAreaView>
  );
}

function TownChip({ label, color, on, onPress }: { label: string; color: string; on: boolean; onPress: () => void }) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={[styles.chip, { borderColor: on ? color : c.border, backgroundColor: on ? color : c.surface }]}
    >
      <View style={[styles.chipDot, { backgroundColor: on ? colors.white : color }]} />
      <AppText variant="caption" style={{ color: on ? colors.white : c.text, fontFamily: fonts.sansSemiBold }}>
        {label}
      </AppText>
    </Pressable>
  );
}

// The card that opens from a pin: photo (or a drawing when there is no free photo), the place, today's
// sea there, and directions.
function PlaceSheet({ place, onClose }: { place: Place | null; onClose: () => void }) {
  const { colors: c, spacing, radii } = useTheme();
  const reduce = useReducedMotion();
  const town = place ? getMunicipality(place.town) : undefined;
  const [showSea, setShowSea] = useState(false);
  const sea = useSeaConditions(showSea ? town : undefined);
  const status = useSiteStatus(!!place);

  const close = () => {
    setShowSea(false);
    onClose();
  };

  return (
    <Modal visible={!!place} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      {place ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(180)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
          <Animated.View entering={reduce ? undefined : SlideInDown.duration(280)} style={[styles.sheet, { borderRadius: 26, backgroundColor: c.surface }]} accessibilityViewIsModal>
            <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: spacing.md }}>
              <View style={styles.photoBox}>
                {place.photo ? <Image source={place.photo.source} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Photo of ${place.name}`} /> : <PlaceArt kind={place.kind} />}
                <View style={styles.badges}>
                  <View style={[styles.badge, { backgroundColor: KIND_COLOR[place.kind] }]}>
                    <AppText variant="caption" style={styles.badgeText}>
                      {place.kindLabel.toUpperCase()}
                    </AppText>
                  </View>
                  <View style={[styles.badge, { backgroundColor: 'rgba(11,34,53,0.8)' }]}>
                    <MaterialCommunityIcons name="map-marker" size={13} color={colors.white} />
                    <AppText variant="caption" style={styles.badgeText}>
                      {town?.name}
                    </AppText>
                  </View>
                </View>
                <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
                  <MaterialCommunityIcons name="close" size={22} color={NIGHT} />
                </Pressable>
              </View>

              <View style={{ padding: spacing.lg, gap: spacing.sm }}>
                <AppText variant="title" accessibilityRole="header">
                  {place.name}
                </AppText>
                <AppText variant="body">{place.about}</AppText>
                <View style={[styles.tip, { gap: spacing.sm, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: c.surfaceMuted }]}>
                  <MaterialCommunityIcons name="leaf" size={18} color={c.selected} />
                  <AppText variant="caption" style={styles.flex}>
                    {place.tip}
                  </AppText>
                </View>

                {place ? <SiteRules placeId={place.id} site={status.sites[place.id]} failed={status.failed} onChanged={status.reload} /> : null}

                {showSea ? <ConditionsCard townName={town?.name ?? 'the area'} state={sea.state} refreshing={sea.refreshing} onRetry={sea.refresh} /> : null}

                <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.xs }]}>
                  <Pressable
                    onPress={() => setShowSea((v) => !v)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.action, { flex: 1, borderRadius: radii.md, backgroundColor: pressed ? '#13A396' : TEAL }]}
                  >
                    <MaterialCommunityIcons name="waves" size={20} color={colors.white} />
                    <AppText variant="label" style={{ color: colors.white }}>
                      {showSea ? 'Hide sea' : 'Sea today'}
                    </AppText>
                  </Pressable>
                </View>

                <Pressable onPress={close} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 6 }}>
                  <AppText variant="caption" color="textMuted">
                    ← Back to the map
                  </AppText>
                </Pressable>
                {place.photo ? (
                  <AppText variant="caption" color="textMuted" style={styles.photoCredit}>
                    {place.photo.credit}
                  </AppText>
                ) : null}
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

// A flat drawing for places without a free photo: sky, sea and the kind of place.
function PlaceArt({ kind }: { kind: PlaceKind }) {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice" accessibilityLabel="Drawing of the place">
      <Rect x={0} y={0} width={360} height={200} fill="#BFE3F2" />
      <Circle cx={292} cy={52} r={26} fill="#F6C453" />
      <Rect x={0} y={118} width={360} height={82} fill={colors.reef300} />
      {kind === 'port' ? (
        <>
          <Path d="M40 118 L200 118 L200 106 L40 106 Z" fill="#8C6A4A" />
          <Path d="M60 118 L60 140 M100 118 L100 140 M140 118 L140 140 M180 118 L180 140" stroke="#6B4F36" strokeWidth={5} />
          <Path d="M230 130 C 250 144, 300 144, 320 128 C 314 140, 300 146, 276 146 C 254 146, 238 140, 230 130 Z" fill={colors.sea900} />
        </>
      ) : kind === 'sandbar' ? (
        <Path d="M60 124 C 120 110, 240 110, 300 124 Z" fill="#F1E2C2" />
      ) : (
        <>
          <Path d="M70 122 C 110 70, 210 64, 270 122 Z" fill={colors.mangrove600} />
          <Path d="M60 122 C 120 112, 230 112, 290 122 Z" fill="#F1E2C2" />
          <Path d="M150 114 C 152 92, 158 78, 168 66" stroke={colors.sea900} strokeWidth={4} strokeLinecap="round" fill="none" />
          <Path d="M168 66 C 156 58, 144 60, 136 68 M168 66 C 178 56, 192 56, 200 64 M168 66 C 166 54, 172 46, 180 44" stroke={colors.mangrove700} strokeWidth={6} strokeLinecap="round" fill="none" />
        </>
      )}
      <Path d="M0 160 C 60 150, 120 170, 180 160 S 300 150, 360 160 L360 200 L0 200 Z" fill={colors.reef500} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.white, fontFamily: fonts.display, fontSize: 30, lineHeight: 38 },
  sub: { color: 'rgba(255,255,255,0.72)' },
  placeCard: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 220, padding: 8, borderRadius: 14, borderWidth: 1.5, backgroundColor: 'rgba(255,255,255,0.06)' },
  placeThumb: { width: 48, height: 48, borderRadius: 10 },
  peek: { position: 'absolute', left: 10, top: 10, width: 112, borderRadius: 12, padding: 4, backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  peekImg: { width: 104, height: 72, borderRadius: 9 },
  peekName: { marginTop: 3, paddingHorizontal: 2, color: NIGHT, fontFamily: fonts.sansSemiBold },
  thumbArt: { alignItems: 'center', justifyContent: 'center' },
  step: { color: 'rgba(255,255,255,0.85)' },
  stepNum: { color: NIGHT, backgroundColor: TEAL, fontFamily: fonts.sansBold, borderRadius: 8, overflow: 'hidden' },
  credit: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontSize: 11, lineHeight: 15 },
  mapBox: { height: '46%', minHeight: 260, overflow: 'hidden', borderWidth: 1.5 },
  fab: { position: 'absolute', right: 12, bottom: 12, width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1.5 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  near: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(5,12,20,0.6)', justifyContent: 'flex-end', padding: 12 },
  sheet: { maxHeight: '88%', overflow: 'hidden', width: '100%', maxWidth: 520, alignSelf: 'center' },
  photoBox: { height: 210, overflow: 'hidden', backgroundColor: '#BFE3F2' },
  badges: { position: 'absolute', left: 14, bottom: 12, flexDirection: 'row', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  badgeText: { color: colors.white, fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 15, letterSpacing: 0.6 },
  close: { position: 'absolute', top: 12, right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  tip: { flexDirection: 'row', alignItems: 'flex-start' },
  action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  outline: { borderWidth: 1.5 },
  photoCredit: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
});
