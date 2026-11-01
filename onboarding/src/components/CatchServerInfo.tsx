import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { flagLabel } from '@/constants/flags';
import type { CatchRecord } from '@/storage/records';
import { useTheme } from '@/theme';

import { AppText } from './AppText';

// What the server said about a catch: the review reasons once it is in, or why it was refused.
export function CatchServerInfo({ record }: { record: CatchRecord }) {
  const { colors, spacing, radii, tones } = useTheme();
  const { sync } = record;

  if (sync.state === 'failed') {
    return (
      <View style={[styles.note, { gap: spacing.sm, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: tones.coral.bg }]}>
        <MaterialCommunityIcons name="close-circle-outline" size={20} color={tones.coral.fg} />
        <AppText variant="caption" style={[styles.flex, { color: colors.text }]}>
          The server did not accept this catch: {sync.lastError ?? 'unknown reason'}. Please show it to the MAO.
        </AppText>
      </View>
    );
  }
  if (sync.state !== 'sent' || !sync.server || sync.server.flagReasons.length === 0) return null;

  const { server } = sync;
  return (
    <View style={[styles.note, { gap: spacing.sm, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: tones.coral.bg }]}>
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={tones.coral.fg} />
      <View style={styles.flex}>
        <AppText variant="label">{server.status === 'reviewed' ? 'Reviewed by the MAO' : 'Flagged for review'}</AppText>
        {server.flagReasons.map((code) => (
          <AppText key={code} variant="caption" color="textMuted">
            {flagLabel(code)}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1, gap: 2 },
});
