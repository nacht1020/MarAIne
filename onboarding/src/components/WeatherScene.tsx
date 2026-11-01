import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { Mood } from '@/constants/weather';
import { colors } from '@/theme';

import { Boat, JumpingFishLayer, WaveBand } from './SeaScene';

// The Home hero: a banca on Marinduque water under a sky that follows the weather. Each mood has its
// own sky, clouds, sun, rain or rainbow; everything is drawn flat in 2D and holds still under reduced
// motion. `children` is the text and controls laid over the sky.

interface Palette {
  sky: string;
  band: string; // a lighter strip near the horizon, for depth without a gradient
  islet: string;
  back: string;
  mid: string;
  front: string;
  cloud: string;
}

const PALETTE: Record<Mood, Palette> = {
  sunny: { sky: '#BFE3F2', band: '#DCEFF6', islet: colors.sea300, back: colors.reef300, mid: colors.reef500, front: colors.sea900, cloud: colors.white },
  clearing: { sky: '#CBE5EE', band: '#E4F2F5', islet: colors.sea300, back: colors.reef300, mid: colors.reef500, front: colors.sea900, cloud: colors.white },
  cloudy: { sky: '#C5CFD6', band: '#D9E0E5', islet: '#8EA4AF', back: '#8DB0BE', mid: '#5E8A9C', front: colors.sea900, cloud: '#EEF1F3' },
  windy: { sky: '#B3C3CC', band: '#C9D5DB', islet: '#8299A5', back: '#7FA7B8', mid: '#4F7D90', front: colors.sea900, cloud: '#E3E8EB' },
  rain: { sky: '#76858F', band: '#8C99A2', islet: '#5F717B', back: '#5E7C8A', mid: '#3F6070', front: colors.sea950, cloud: '#9AA6AE' },
  night: { sky: colors.sea950, band: '#10283A', islet: colors.sea800, back: colors.sea800, mid: colors.sea700, front: '#06141D', cloud: '#2A4152' },
};

// Text on the sky: dark on light skies, light on dark ones.
export const moodInk = (mood: Mood) => (mood === 'rain' || mood === 'night' ? colors.sand50 : colors.sea900);

interface WeatherSceneProps {
  mood: Mood;
  waveHeightM: number | null;
  height: number;
  children?: ReactNode;
}

// A weather change cross-fades the whole look over this long. Opacity only, on the UI thread.
const FADE_MS = 700;
const fadeIn = FadeIn.duration(FADE_MS).easing(Easing.inOut(Easing.quad));
const fadeOut = FadeOut.duration(FADE_MS).easing(Easing.inOut(Easing.quad));

export function WeatherScene({ mood, waveHeightM, height, children }: WeatherSceneProps) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const p = PALETTE[mood];
  // Wind makes the sea and the boat livelier even when the swell itself is small.
  const h = (waveHeightM ?? 0.2) + (mood === 'windy' ? 1.2 : mood === 'rain' ? 0.6 : 0);
  const seaTop = height * 0.66;
  const geo = { width, height, seaTop, h };
  // Float the banca on the middle wave: its waterline (about 20% up the drawing) sits on the wave's mean
  // surface, so the wave laps the hull instead of swallowing it. The band's mean surface is 76 - amp up.
  const boatH = Math.min(200, Math.max(130, width * 0.42)) * 0.6;
  const surface = (height - seaTop) * 0.22 + 76 - waveMotion(h).amp;
  const boatBottom = surface - boatH * 0.15;

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    // The frame is already painted in the new sky and sea colors, so nothing pale shows through
    // while the old and new layers cross-fade on top of it.
    <View onLayout={onLayout} style={[styles.frame, { height, backgroundColor: p.sky }]}>
      <View style={[styles.sea, { top: seaTop, backgroundColor: p.back }]} />

      {width > 0 ? (
        <>
          {/* Sky, clouds, sun or rain clouds, islets and the far waves. Keyed by mood: the old one fades out as the new one fades in. */}
          <Animated.View
            key={`back-${mood}`}
            entering={reduce ? undefined : fadeIn}
            exiting={reduce ? undefined : fadeOut}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            renderToHardwareTextureAndroid
          >
            <BackLayer mood={mood} geo={geo} reduce={reduce} />
          </Animated.View>

          {/* Shared by every mood, so they never jump: the boat eases its rocking to the new sea. */}
          <JumpingFishLayer width={width} height={(height - seaTop) * 2.4} reduce={reduce} />
          <Boat sceneWidth={width} bottom={boatBottom} waveHeightM={h} reduce={reduce} />

          <Animated.View
            key={`front-${mood}`}
            entering={reduce ? undefined : fadeIn}
            exiting={reduce ? undefined : fadeOut}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            renderToHardwareTextureAndroid
          >
            <FrontLayer mood={mood} geo={geo} reduce={reduce} />
          </Animated.View>
        </>
      ) : null}

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

type Geo = { width: number; height: number; seaTop: number; h: number };

const waveMotion = (h: number) => ({ amp: Math.min(14, 2.5 + h * 5), drift: Math.max(4200, 11000 - h * 2600) });

function BackLayer({ mood, geo, reduce }: { mood: Mood; geo: Geo; reduce: boolean }) {
  const p = PALETTE[mood];
  const { width, height, seaTop } = geo;
  const { amp, drift } = waveMotion(geo.h);
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: p.sky }]} />
      <View style={[styles.band, { top: seaTop - height * 0.22, height: height * 0.22, backgroundColor: p.band }]} />
      {mood === 'night' ? <Stars width={width} height={seaTop} /> : null}
      {mood === 'sunny' || mood === 'clearing' ? <Sun width={width} reduce={reduce} faint={mood === 'clearing'} /> : null}
      {mood === 'night' ? <Moon width={width} /> : null}
      {mood === 'clearing' ? <Rainbow width={width} seaTop={seaTop} /> : null}
      <Svg style={[StyleSheet.absoluteFill, { top: seaTop - 40, height: 44 }]} viewBox="0 0 360 44" preserveAspectRatio="xMinYMax meet">
        <Path d="M18 42 C 26 20, 44 16, 56 42 Z" fill={p.islet} />
        <Path d="M52 42 C 60 28, 74 27, 82 42 Z" fill={p.islet} />
        <Path d="M80 42 C 85 34, 93 34, 98 42 Z" fill={p.islet} />
      </Svg>
      <Clouds mood={mood} width={width} skyHeight={seaTop} reduce={reduce} color={p.cloud} />
      {mood === 'windy' ? <WindStreaks width={width} skyHeight={seaTop} reduce={reduce} /> : null}
      {mood === 'sunny' || mood === 'clearing' || mood === 'cloudy' ? <Birds width={width} skyHeight={seaTop} reduce={reduce} /> : null}
      <View style={[styles.sea, { top: seaTop, backgroundColor: p.back }]} />
      <WaveBand width={width} bottom={height - seaTop - 40} amp={amp * 0.6} duration={drift * 1.5} color={p.back} reduce={reduce} />
    </>
  );
}

function FrontLayer({ mood, geo, reduce }: { mood: Mood; geo: Geo; reduce: boolean }) {
  const p = PALETTE[mood];
  const { width, height, seaTop } = geo;
  const { amp, drift } = waveMotion(geo.h);
  return (
    <>
      <WaveBand width={width} bottom={(height - seaTop) * 0.22} amp={amp} duration={drift} color={p.mid} reduce={reduce} reverse />
      <WaveBand width={width} bottom={-6} amp={amp * 0.8} duration={drift * 0.8} color={p.front} reduce={reduce} />
      {mood === 'rain' ? <Rain width={width} height={height} reduce={reduce} /> : null}
    </>
  );
}

// ---- pieces --------------------------------------------------------------

// A repeating 0..1 clock shared by a layer; each item adds its own offset.
function useLoop(duration: number, reduce: boolean) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t, duration, reduce]);
  return t;
}

function Sun({ width, reduce, faint }: { width: number; reduce: boolean; faint: boolean }) {
  const spin = useLoop(24000, reduce);
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const size = 150;
  return (
    <View pointerEvents="none" style={[styles.abs, { left: width - size + 18, top: 34, width: size, height: size, opacity: faint ? 0.8 : 1 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, rays]}>
        <Svg width={size} height={size} viewBox="0 0 150 150">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <Line key={i} x1={75 + Math.cos(a) * 46} y1={75 + Math.sin(a) * 46} x2={75 + Math.cos(a) * 62} y2={75 + Math.sin(a) * 62} stroke={colors.coral300} strokeWidth={4} strokeLinecap="round" />;
          })}
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox="0 0 150 150" style={StyleSheet.absoluteFill}>
        <Circle cx={75} cy={75} r={40} fill={colors.coral100} />
        <Circle cx={75} cy={75} r={30} fill="#F6C453" />
      </Svg>
    </View>
  );
}

function Moon({ width }: { width: number }) {
  return (
    <Svg pointerEvents="none" width={70} height={70} viewBox="0 0 70 70" style={[styles.abs, { left: width - 100, top: 56 }]}>
      <Circle cx={35} cy={35} r={22} fill={colors.sand100} />
      <Circle cx={45} cy={29} r={20} fill={PALETTE.night.sky} />
    </Svg>
  );
}

function Stars({ width, height }: { width: number; height: number }) {
  const stars = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ x: (i * 97) % 1000 / 1000, y: (i * 53) % 700 / 1000, r: i % 3 === 0 ? 1.6 : 1 })), []);
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={width} height={height}>
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x * width} cy={30 + s.y * (height - 60)} r={s.r} fill={colors.sand200} />
      ))}
    </Svg>
  );
}

function Rainbow({ width, seaTop }: { width: number; seaTop: number }) {
  const bands = ['#E9806A', '#F2B65A', '#F3DD6B', '#8CC98F', '#6FA9D6', '#9A8BCB'];
  const r = Math.min(width * 0.42, 190);
  const cx = width * 0.62;
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={width} height={seaTop + 4}>
      {bands.map((c, i) => {
        const rr = r - i * 7;
        return <Path key={c} d={`M ${cx - rr} ${seaTop} A ${rr} ${rr} 0 0 1 ${cx + rr} ${seaTop}`} stroke={c} strokeWidth={7} strokeOpacity={0.55} fill="none" />;
      })}
    </Svg>
  );
}

// Cloud count, size and speed per mood.
const CLOUDS: Record<Mood, { n: number; scale: number; speed: number }> = {
  sunny: { n: 1, scale: 0.7, speed: 60000 },
  clearing: { n: 2, scale: 0.8, speed: 50000 },
  cloudy: { n: 4, scale: 1, speed: 46000 },
  windy: { n: 4, scale: 0.9, speed: 14000 },
  rain: { n: 5, scale: 1.25, speed: 36000 },
  night: { n: 2, scale: 0.8, speed: 70000 },
};

function Clouds({ mood, width, skyHeight, reduce, color }: { mood: Mood; width: number; skyHeight: number; reduce: boolean; color: string }) {
  const cfg = CLOUDS[mood];
  const t = useLoop(cfg.speed, reduce);
  return (
    <>
      {Array.from({ length: cfg.n }, (_, i) => (
        <Cloud key={`${mood}-${i}`} t={t} offset={i / cfg.n} top={24 + ((i * 37) % 70) + (mood === 'rain' ? -10 : 0)} width={width} scale={cfg.scale * (i % 2 ? 0.85 : 1)} color={color} skyHeight={skyHeight} />
      ))}
    </>
  );
}

function Cloud({ t, offset, top, width, scale, color, skyHeight }: { t: SharedValue<number>; offset: number; top: number; width: number; scale: number; color: string; skyHeight: number }) {
  const w = 140 * scale;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: (((t.value + offset) % 1) * (width + w * 2)) - w }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { top: Math.min(top, skyHeight - 60), left: 0, width: w, height: w * 0.5 }, style]}>
      <Svg width={w} height={w * 0.5} viewBox="0 0 140 70">
        <Path d="M20 62 C 4 62, 2 40, 20 38 C 18 20, 42 12, 54 26 C 62 6, 96 6, 102 30 C 122 26, 136 42, 126 56 C 124 62, 118 62, 112 62 Z" fill={color} />
      </Svg>
    </Animated.View>
  );
}

function WindStreaks({ width, skyHeight, reduce }: { width: number; skyHeight: number; reduce: boolean }) {
  const t = useLoop(2600, reduce);
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <Streak key={i} t={t} offset={i * 0.27} top={40 + i * ((skyHeight - 80) / 4)} width={width} />
      ))}
    </>
  );
}

function Streak({ t, offset, top, width }: { t: SharedValue<number>; offset: number; top: number; width: number }) {
  const style = useAnimatedStyle(() => {
    const p = (t.value + offset) % 1;
    return { opacity: p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1, transform: [{ translateX: p * (width + 120) - 120 }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { top, left: 0 }, style]}>
      <Svg width={110} height={14} viewBox="0 0 110 14">
        <Path d="M2 7 C 30 2, 60 12, 108 6" stroke={colors.white} strokeOpacity={0.8} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

// A few seabirds gliding across the sky in fair weather, each flapping on its own beat.
function Birds({ width, skyHeight, reduce }: { width: number; skyHeight: number; reduce: boolean }) {
  const t = useLoop(30000, reduce);
  const flap = useLoop(900, reduce);
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Bird key={i} t={t} flap={flap} offset={i * 0.09} phase={i * 0.33} top={skyHeight * 0.42 + i * 12} width={width} size={i === 1 ? 16 : 20} />
      ))}
    </>
  );
}

function Bird({ t, flap, offset, phase, top, width, size }: { t: SharedValue<number>; flap: SharedValue<number>; offset: number; phase: number; top: number; width: number; size: number }) {
  const style = useAnimatedStyle(() => {
    const p = (t.value + offset) % 1;
    const f = Math.abs(Math.sin(((flap.value + phase) % 1) * Math.PI * 2));
    return {
      transform: [{ translateX: p * (width + 80) - 40 }, { translateY: Math.sin(p * Math.PI * 4) * 6 }, { scaleY: 0.45 + f * 0.55 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { top, left: 0 }, style]}>
      <Svg width={size} height={size * 0.5} viewBox="0 0 20 10">
        <Path d="M1 8 Q 5 1, 10 7 Q 15 1, 19 8" stroke={colors.sea800} strokeOpacity={0.55} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

// Slanted rain over the whole scene: two stacked tiles slide down and loop without a seam.
function Rain({ width, height, reduce }: { width: number; height: number; reduce: boolean }) {
  const t = useLoop(700, reduce);
  const drops = useMemo(
    () => Array.from({ length: 46 }, (_, i) => ({ x: ((i * 131) % 1000) / 1000, y: ((i * 71) % 1000) / 1000, l: 10 + (i % 4) * 3 })),
    [],
  );
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * height - height }] }));
  const tile = (
    <Svg width={width} height={height}>
      {drops.map((d, i) => (
        <Line key={i} x1={d.x * width} y1={d.y * height} x2={d.x * width - 4} y2={d.y * height + d.l} stroke={colors.white} strokeOpacity={0.55} strokeWidth={1.6} strokeLinecap="round" />
      ))}
    </Svg>
  );
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: 0, width, height: height * 2 }, style]}>
      {tile}
      {tile}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden' },
  abs: { position: 'absolute' },
  band: { position: 'absolute', left: 0, right: 0 },
  sea: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
