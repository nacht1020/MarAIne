import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme';

interface SeaSceneProps {
  // Live wave height for the user's town; null while loading or when unknown (drawn as a calm sea).
  waveHeightM: number | null;
  height?: number;
}

type Sky = 'day' | 'golden' | 'night';

function skyNow(): Sky {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 5 || h >= 18.75) return 'night';
  if (h < 6.5 || h >= 17) return 'golden';
  return 'day';
}

const SKY: Record<Sky, { bg: string; orb: string; halo: string }> = {
  day: { bg: colors.sand50, orb: colors.coral300, halo: colors.coral100 },
  golden: { bg: colors.coral100, orb: colors.coral500, halo: colors.coral300 },
  night: { bg: colors.sea950, orb: colors.sand100, halo: colors.sea800 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// One 360-wide tile whose ends meet, so two side by side loop without a seam.
function wavePath(amp: number) {
  const top = 4 + amp;
  const lo = top - amp;
  const hi = top + amp;
  return `M0 ${top} C 30 ${lo}, 60 ${lo}, 90 ${top} S 150 ${hi}, 180 ${top} S 240 ${lo}, 270 ${top} S 330 ${hi}, 360 ${top} L360 80 L0 80 Z`;
}

// A banca on Marinduque water. Waves move with the real sea; the boat rocks when tapped and a fish
// jumps wherever the water is tapped. Everything holds still when the phone asks for reduced motion.
export function SeaScene({ waveHeightM, height = 196 }: SeaSceneProps) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [sky] = useState(skyNow);
  const h = waveHeightM ?? 0.2;

  // Bigger sea: taller crests, quicker drift, livelier boat.
  const amp = clamp(2.5 + h * 5, 2.5, 14);
  const drift = clamp(11000 - h * 2600, 4200, 11000);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View
      onLayout={onLayout}
      style={[styles.frame, { height, backgroundColor: SKY[sky].bg }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Drawing of a banca on the water. The waves follow today's sea conditions."
    >
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 196" preserveAspectRatio="xMidYMax slice">
        {sky === 'night' ? (
          <>
            {[
              [40, 30], [92, 52], [150, 22], [204, 46], [318, 30], [338, 70], [120, 80],
            ].map(([x, y]) => (
              <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} fill={colors.sand200} />
            ))}
            <Circle cx={262} cy={56} r={22} fill={SKY.night.orb} />
            {/* The "bite" turns the full circle into a waxing moon. */}
            <Circle cx={272} cy={50} r={20} fill={SKY.night.bg} />
          </>
        ) : (
          <>
            <Circle cx={262} cy={sky === 'golden' ? 96 : 58} r={44} fill={SKY[sky].halo} />
            <Circle cx={262} cy={sky === 'golden' ? 96 : 58} r={27} fill={SKY[sky].orb} />
          </>
        )}
        {/* Small islets on the horizon, uneven on purpose. */}
        <Path d="M18 112 C 26 92, 44 88, 56 112 Z" fill={sky === 'night' ? colors.sea800 : colors.sea300} />
        <Path d="M52 112 C 60 99, 74 98, 82 112 Z" fill={sky === 'night' ? colors.sea800 : colors.sea300} />
        <Path d="M80 112 C 85 105, 93 105, 98 112 Z" fill={sky === 'night' ? colors.sea800 : colors.sea300} />
        <Path d="M0 110 L360 110 L360 196 L0 196 Z" fill={sky === 'night' ? colors.sea900 : colors.reef100} />
      </Svg>

      {width > 0 ? (
        <>
          <WaveBand width={width} bottom={height * 0.3} amp={amp * 0.6} duration={drift * 1.5} color={sky === 'night' ? colors.sea800 : colors.reef300} reduce={reduce} />
          {/* Fish sits under the boat so taps on the hull rock the boat; the front waves let taps through. */}
          <JumpingFishLayer width={width} height={height} reduce={reduce} />
          <Boat sceneWidth={width} bottom={height * 0.17} waveHeightM={h} reduce={reduce} />
          <WaveBand width={width} bottom={height * 0.12} amp={amp} duration={drift} color={sky === 'night' ? colors.sea700 : colors.reef500} reduce={reduce} reverse />
          <WaveBand width={width} bottom={-6} amp={amp * 0.8} duration={drift * 0.8} color={colors.sea900} reduce={reduce} />
        </>
      ) : null}
    </View>
  );
}

export function WaveBand({
  width,
  bottom,
  amp,
  duration,
  color,
  reduce,
  reverse = false,
}: {
  width: number;
  bottom: number;
  amp: number;
  duration: number;
  color: string;
  reduce: boolean;
  reverse?: boolean;
}) {
  const x = useSharedValue(0);
  const d = useMemo(() => wavePath(amp), [amp]);

  useEffect(() => {
    if (reduce) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-width, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [x, width, duration, reduce]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: reverse ? -width - x.value : x.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.band, { bottom, width: width * 2, height: 80 }, style]}>
      {[0, 1].map((i) => (
        // Each tile overlaps the next by 1px so no hairline seam shows where they meet.
        <Svg key={i} width={width + 1} height={80} viewBox="0 0 360 80" preserveAspectRatio="none" style={{ marginLeft: i ? -1 : 0 }}>
          <Path d={d} fill={color} />
        </Svg>
      ))}
    </Animated.View>
  );
}

export function Boat({ sceneWidth, bottom, waveHeightM, reduce }: { sceneWidth: number; bottom: number; waveHeightM: number; reduce: boolean }) {
  const bob = useSharedValue(0);
  const sway = useSharedValue(0);
  const tapY = useSharedValue(0);
  const tapR = useSharedValue(0);
  const boatWidth = clamp(sceneWidth * 0.42, 130, 200);
  // How high and how far the boat rocks. Eased on the UI thread when the sea changes, so a switch from
  // calm to windy grows the motion instead of snapping to it.
  const lift = useSharedValue(clamp(2 + waveHeightM * 4, 2, 12));
  const tilt = useSharedValue(clamp(1.5 + waveHeightM * 3, 1.5, 9));

  useEffect(() => {
    lift.value = withTiming(clamp(2 + waveHeightM * 4, 2, 12), { duration: 900, easing: Easing.inOut(Easing.quad) });
    tilt.value = withTiming(clamp(1.5 + waveHeightM * 3, 1.5, 9), { duration: 900, easing: Easing.inOut(Easing.quad) });
  }, [waveHeightM, lift, tilt]);

  useEffect(() => {
    if (reduce) return;
    bob.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
    // A slow drift back and forth, out of step with the bob, so the boat never looks parked.
    sway.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(bob);
      cancelAnimation(sway);
    };
  }, [bob, sway, reduce]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: (sway.value - 0.5) * 24 },
      { translateY: -bob.value * lift.value + tapY.value },
      { rotate: `${(bob.value - 0.5) * 2 * tilt.value + tapR.value}deg` },
    ],
  }));

  const rock = () => {
    if (reduce) return;
    tapY.value = withSequence(withTiming(-10, { duration: 160 }), withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) }));
    tapR.value = withSequence(
      withTiming(-9, { duration: 140 }),
      withTiming(7, { duration: 220 }),
      withTiming(-3, { duration: 200 }),
      withTiming(0, { duration: 260 }),
    );
  };

  return (
    <Animated.View style={[styles.boat, { bottom, left: sceneWidth * 0.18, width: boatWidth, height: boatWidth * 0.6 }, style]}>
      <Pressable onPress={rock} accessible={false} style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="74 118 158 94">
          {/* The fisher in a salakot, line out over the bow. Drawn before the hull so the hull hides their legs. */}
          <Path d="M137 177 L106 150" stroke="#8A5A2B" strokeWidth={2} strokeLinecap="round" />
          <Path d="M106 150 Q 100 170, 99 200" stroke={colors.sand100} strokeOpacity={0.8} strokeWidth={0.8} fill="none" />
          <Path d="M123 194 L125 179 Q 130 172, 136 179 L138 194 Z" fill={colors.reef500} />
          <Circle cx={130} cy={169} r={5} fill="#C68B59" />
          <Path d="M120 168 L130 159 L140 168 Z" fill="#D9B26F" />
          <Path d="M152 190 L152 124" stroke={colors.sea900} strokeWidth={3} strokeLinecap="round" />
          <Path d="M155 128 L155 182 L194 177 Z" fill={colors.coral500} />
          <Path d="M155 150 L178 179" stroke={colors.coral700} strokeWidth={1.5} strokeOpacity={0.5} />
          <Path d="M100 186 C 128 200, 176 200, 206 183 C 200 195, 180 203, 152 203 C 126 203, 108 197, 100 186 Z" fill={colors.sea900} />
          <Path d="M110 192 C 136 199, 170 199, 196 190" stroke={colors.sand100} strokeWidth={1.5} strokeOpacity={0.6} fill="none" />
          {/* Katig: the bamboo outriggers. */}
          <Path d="M78 207 L228 207 M130 199 L120 207 M178 199 L188 207" stroke={colors.sea900} strokeWidth={3} strokeLinecap="round" />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

// Tap the water and a fish arcs out of it at that spot.
export function JumpingFishLayer({ width, height, reduce }: { width: number; height: number; reduce: boolean }) {
  const [x, setX] = useState(width * 0.7);
  const t = useSharedValue(0);

  const jump = (e: GestureResponderEvent) => {
    if (reduce) return;
    setX(clamp(e.nativeEvent.locationX - 13, 8, width - 34));
    t.value = 0;
    t.value = withTiming(1, { duration: 900, easing: Easing.linear });
  };

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const up = 4 * p * (1 - p); // 0 -> 1 -> 0
    return {
      opacity: p > 0 && p < 1 ? 1 : 0,
      transform: [{ translateX: p * 34 }, { translateY: -up * 46 }, { rotate: `${-35 + p * 70}deg` }],
    };
  });

  return (
    <Pressable onPress={jump} accessible={false} style={[styles.water, { height: height * 0.36 }]}>
      <Animated.View pointerEvents="none" style={[styles.fish, { left: x }, style]}>
        <MaterialCommunityIcons name="fish" size={26} color={colors.reef300} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: 24 },
  band: { position: 'absolute', left: 0, flexDirection: 'row' },
  boat: { position: 'absolute' },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fish: { position: 'absolute', top: 18 },
});
