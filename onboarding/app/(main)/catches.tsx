import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { AppText, Button, CatchRow, EmptyState, kg, ScreenContainer, SyncBanner, timeOfDay } from '@/components';
import { CatchServerInfo } from '@/components/CatchServerInfo';
import { useRecords } from '@/hooks/useRecords';
import { useSync } from '@/hooks/useSync';
import type { CatchRecord } from '@/storage/records';
import { useTheme } from '@/theme';

const DAY_MS = 86_400_000;

function dayLabel(iso: string) {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((start.getTime() - new Date(d).setHours(0, 0, 0, 0)) / DAY_MS);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDay(list: CatchRecord[]) {
  const groups: { label: string; items: CatchRecord[] }[] = [];
  for (const c of list) {
    const label = dayLabel(c.caughtAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(c);
    else groups.push({ label, items: [c] });
  }
  return groups;
}

export default function CatchesScreen() {
  const router = useRouter();
  const { colors, spacing, radii } = useTheme();
  const { isLoaded, catches, deleteCatch } = useRecords();
  const { syncing, syncNow } = useSync();
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const week = useMemo(() => {
    const since = Date.now() - 7 * DAY_MS;
    const recent = catches.filter((c) => new Date(c.caughtAt).getTime() >= since);
    return { count: recent.length, kg: recent.reduce((sum, c) => sum + c.weightKg, 0) };
  }, [catches]);

  const groups = useMemo(() => groupByDay(catches), [catches]);
  const card = { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: colors.surface };

  return (
    <ScreenContainer
      edges={['top', 'left', 'right']}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={syncNow} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <AppText variant="title" accessibilityRole="header" style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
        My catches
      </AppText>

      {!isLoaded ? (
        <View style={{ gap: spacing.sm }} accessibilityLabel="Loading your catches" accessibilityRole="progressbar">
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ height: 64, borderRadius: radii.md, backgroundColor: colors.surfaceMuted }} />
          ))}
        </View>
      ) : catches.length === 0 ? (
        <View style={[styles.card, card]}>
          <EmptyState
            title="No catches yet"
            body="Everything you log shows up here, newest first, even before it is sent."
            action={<Button label="Log a catch" trailingIcon="arrow-forward" onPress={() => router.push('/log')} />}
          />
        </View>
      ) : (
        <>
          <View style={[styles.summary, card, styles.card, { padding: spacing.md, gap: spacing.md }]}>
            <Stat label="Last 7 days" value={`${week.count}`} unit={week.count === 1 ? 'catch' : 'catches'} />
            <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.borderStrong }} />
            <Stat label="Total weight" value={kg(week.kg).replace(' kg', '')} unit="kg" />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <SyncBanner showAllSent />
          </View>

          {groups.map((g) => (
            <View key={g.label} style={{ marginTop: spacing.lg, gap: spacing.xs }}>
              <AppText variant="eyebrow" color="textMuted" accessibilityRole="header">
                {g.label}
              </AppText>
              <View style={[styles.card, card]}>
                {g.items.map((c, i) => {
                  const expanded = open === c.clientUuid;
                  return (
                    <Animated.View
                      key={c.clientUuid}
                      layout={LinearTransition.duration(180)}
                      style={{ borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong }}
                    >
                      <Pressable
                        onPress={() => {
                          setOpen(expanded ? null : c.clientUuid);
                          setConfirming(null);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        accessibilityHint="Shows details and delete"
                        style={({ pressed }) => ({ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: pressed ? colors.surfaceMuted : 'transparent' })}
                      >
                        <CatchRow record={c} />
                      </Pressable>
                      {expanded ? (
                        <Animated.View entering={FadeIn.duration(160)} style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm }}>
                          <Detail label="Caught" value={`${dayLabel(c.caughtAt)}, ${timeOfDay(c.caughtAt)}`} />
                          <Detail label="Length" value={c.sizeCm === null ? 'Not given' : `${c.sizeCm} cm`} />
                          <Detail
                            label="Location"
                            value={c.location ? `Saved${c.location.accuracyM === null ? '' : ` (±${c.location.accuracyM} m)`}` : 'Not saved'}
                          />
                          <CatchServerInfo record={c} />
                          {c.sync.state === 'sent' ? null : confirming === c.clientUuid ? (
                            <View style={[styles.rowGap, { gap: spacing.sm }]}>
                              <View style={styles.flex}>
                                <Button label="Keep it" variant="secondary" onPress={() => setConfirming(null)} />
                              </View>
                              <View style={styles.flex}>
                                <Button label="Delete" onPress={() => deleteCatch(c.clientUuid)} />
                              </View>
                            </View>
                          ) : (
                            <Button label="Delete this catch" variant="ghost" onPress={() => setConfirming(c.clientUuid)} />
                          )}
                        </Animated.View>
                      ) : null}
                    </Animated.View>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      )}
    </ScreenContainer>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.flex}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="title" style={styles.tabular}>
        {value}{' '}
        <AppText variant="body" color="textMuted">
          {unit}
        </AppText>
      </AppText>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowGap}>
      <AppText variant="caption" color="textMuted" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText variant="label" style={styles.flex}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, overflow: 'hidden' },
  summary: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  rowGap: { flexDirection: 'row', alignItems: 'center' },
  detailLabel: { width: 84 },
  tabular: { fontVariant: ['tabular-nums'] },
});
