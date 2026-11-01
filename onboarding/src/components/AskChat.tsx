import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import type { GestureResponderHandlers } from 'react-native';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';

import { AppText, ChoiceChip, IconBadge } from '@/components';
import { STORAGE_PREFIX } from '@/constants/app';
import type { RoleId } from '@/constants/roles';
import { useLanguage } from '@/hooks/useLanguage';
import { useOnboarding } from '@/hooks/useOnboarding';
import { askAssistant, type ChatLang, type ChatTurn } from '@/services/assistant';
import { canListen, listen, speak, stopSpeaking } from '@/services/voice';
import { fonts, useTheme } from '@/theme';

const LANG_KEY = `${STORAGE_PREFIX}/chat-lang/v1`;

// Starter questions per role and language, in simple words, so the first tap is easy.
const STARTERS: Record<ChatLang, Record<RoleId | 'none', string[]>> = {
  en: {
    fisherfolk: ['Is it safe to go out today?', 'Will the waves be big tomorrow?', 'Where can I not fish?', 'What time is sunset today?'],
    aquaculture: ['Will it rain a lot this week?', 'How do I spot ice-ice early?', 'Is the sea calm enough to check my lines?'],
    'bantay-dagat': ['Is the sea OK for a patrol today?', 'What should I report?', 'Where is fishing not allowed?', 'What do I do if I see dynamite fishing?'],
    tourist: ['Where can I snorkel?', 'Is today good for island hopping?', 'What should I not do on the reef?', 'Will it rain this afternoon?'],
    community: ['Is a storm coming?', 'How do I report trash?', 'Where are the sanctuaries?', 'Will it rain this afternoon?'],
    none: ['Is it safe to go out today?', 'Where can I snorkel?', 'What are the rules at sea?'],
  },
  tl: {
    fisherfolk: ['Ligtas bang pumalaot ngayon?', 'Malakas ba ang alon bukas?', 'Saan bawal mangisda?', 'Anong oras lulubog ang araw ngayon?'],
    aquaculture: ['Uulan ba nang malakas ngayong linggo?', 'Paano makita agad ang ice-ice?', 'Kalmado ba ang dagat para tingnan ang linya ko?'],
    'bantay-dagat': ['Maayos ba ang dagat para sa patrol ngayon?', 'Ano ang dapat kong i-report?', 'Saan bawal mangisda?', 'Ano ang gagawin kung may nagda-dinamita?'],
    tourist: ['Saan pwedeng mag-snorkel?', 'Maganda ba ngayon para sa island hopping?', 'Ano ang bawal gawin sa bahura?', 'Uulan ba mamayang hapon?'],
    community: ['May bagyo bang darating?', 'Paano mag-report ng basura?', 'Saan ang mga sanctuary?', 'Uulan ba mamayang hapon?'],
    none: ['Ligtas bang pumalaot ngayon?', 'Saan pwedeng mag-snorkel?', 'Ano ang mga patakaran sa dagat?'],
  },
};

// Every line the chat itself shows, in both languages.
type UiKey = 'subtitle' | 'welcome' | 'placeholder' | 'note' | 'local' | 'switch' | 'listening' | 'notHeard' | 'micBlocked' | 'talk' | 'stopTalk' | 'read' | 'stopRead';
const UI: Record<ChatLang, Record<UiKey, string>> = {
  en: {
    subtitle: 'Sea, weather, places and rules',
    welcome: 'Great! Ask me anything about the sea, the weather, places to visit, or the rules. Here are some ideas:',
    placeholder: 'Type your question',
    note: 'I can make mistakes. For storm warnings, follow PAGASA.',
    local: 'Quick answer from the app',
    switch: 'Change language',
    listening: 'Listening… speak now',
    notHeard: "I didn't catch that. Tap the mic and try again.",
    micBlocked: 'Allow the microphone in your browser so you can talk to me.',
    talk: 'Ask by voice',
    stopTalk: 'Stop listening',
    read: 'Read this answer aloud',
    stopRead: 'Stop reading',
  },
  tl: {
    subtitle: 'Dagat, panahon, pasyalan at patakaran',
    welcome: 'Sige! Magtanong ka tungkol sa dagat, panahon, mga pasyalan, o mga patakaran. Heto ang ilang halimbawa:',
    placeholder: 'Isulat ang tanong mo',
    note: 'Puwede akong magkamali. Para sa babala ng bagyo, sundin ang PAGASA.',
    local: 'Mabilis na sagot mula sa app',
    switch: 'Palitan ang wika',
    listening: 'Nakikinig… magsalita ka na',
    notHeard: 'Hindi kita narinig. Pindutin ulit ang mic at subukan.',
    micBlocked: 'Payagan ang mikropono sa browser para makapagsalita ka.',
    talk: 'Magtanong gamit ang boses',
    stopTalk: 'Itigil ang pakikinig',
    read: 'Basahin nang malakas ang sagot',
    stopRead: 'Itigil ang pagbasa',
  },
};

interface AskChatProps {
  onClose: () => void;
  // Pan handlers from the floating window; attached to the header so it can be dragged.
  dragHandlers: GestureResponderHandlers;
}

// The chat inside the floating window opened by the round button (FloatingAsk).
export function AskChat({ onClose, dragHandlers }: AskChatProps) {
  const { colors, spacing, radii } = useTheme();
  const { state } = useOnboarding();
  const app = useLanguage();
  // The person picks a language before anything else; it is remembered on the phone.
  const [lang, setLang] = useState<ChatLang | null>(null);
  const [langLoaded, setLangLoaded] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  // Indexes of replies built on the phone (AI not reachable), labelled so nobody mistakes them for the AI.
  const [localReplies, setLocalReplies] = useState<Set<number>>(new Set());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Voice: which answer is being read aloud, and whether the mic is open.
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const micAvailable = canListen();

  // Stop talking and listening when the chat closes.
  useEffect(
    () => () => {
      stopSpeaking();
      stopListening.current?.();
    },
    [],
  );

  const readAloud = (i: number, content: string) => {
    if (!lang) return;
    if (speaking === i) {
      stopSpeaking();
      setSpeaking(null);
      return;
    }
    setSpeaking(i);
    speak(content, lang, () => setSpeaking((cur) => (cur === i ? null : cur)));
  };

  const toggleMic = () => {
    if (!lang || busy) return;
    if (listening) {
      stopListening.current?.();
      return;
    }
    stopSpeaking();
    setSpeaking(null);
    setError(null);
    setListening(true);
    let said = '';
    stopListening.current = listen(lang, {
      onText: (heard) => {
        said = heard;
        setText(heard);
      },
      onEnd: (err) => {
        setListening(false);
        stopListening.current = null;
        // A spoken question is sent as soon as the person stops, and its answer is read back.
        if (said) send(said, true);
        else if (err === 'not-allowed' || err === 'service-not-allowed') setError(UI[lang].micBlocked);
        else if (err !== 'aborted') setError(UI[lang].notHeard);
      },
    });
  };

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((v) => (v === 'en' || v === 'tl' ? setLang(v) : app.chosen ? setLang(app.lang === 'fil' ? 'tl' : 'en') : null))
      .catch(() => {})
      .finally(() => setLangLoaded(true));
  }, []);

  const chooseLang = (next: ChatLang | null) => {
    setLang(next);
    if (next) AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
    else AsyncStorage.removeItem(LANG_KEY).catch(() => {});
  };

  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [turns, busy]);

  const send = async (question: string, byVoice = false) => {
    const q = question.trim();
    if (!q || busy || !lang) return;
    const next: ChatTurn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setText('');
    setError(null);
    setBusy(true);
    try {
      const reply = await askAssistant(next, state.municipality, state.role, lang);
      setTurns([...next, { role: 'assistant', content: reply.text }]);
      if (byVoice) readAloud(next.length, reply.text);
      setLocalReplies((n) => (reply.source === 'app' ? new Set(n).add(next.length) : n));
    } catch {
      setError(lang === 'tl' ? 'May problema. Subukan ulit.' : 'Something went wrong. Please try again.');
      // Put the question back so it is not lost.
      setTurns(turns);
      setText(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        <View
          {...dragHandlers}
          accessibilityHint="Drag to move the chat window"
          style={[styles.row, styles.header, { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: 6, paddingBottom: spacing.sm, borderBottomColor: colors.border }]}
        >
          <View style={[styles.grip, { backgroundColor: colors.borderStrong }]} />
          <IconBadge icon="lifebuoy" tone="reef" size="sm" />
          <View style={styles.flex}>
            <AppText variant="heading" accessibilityRole="header">
              Ask MarAIne
            </AppText>
            <AppText variant="caption" color="textMuted">
              {UI[lang ?? 'en'].subtitle}
            </AppText>
          </View>
          {lang ? (
            <Pressable
              onPress={() => chooseLang(null)}
              accessibilityRole="button"
              accessibilityLabel={UI[lang].switch}
              hitSlop={8}
              style={[styles.langPill, { borderColor: colors.borderStrong, borderRadius: radii.pill }]}
            >
              <AppText variant="caption" style={styles.langText}>
                {lang === 'en' ? 'EN' : 'FIL'}
              </AppText>
            </Pressable>
          ) : null}
          {turns.length > 0 ? (
            <Pressable onPress={() => { stopSpeaking(); setSpeaking(null); setTurns([]); setLocalReplies(new Set()); }} accessibilityRole="button" accessibilityLabel="Start a new chat" hitSlop={10}>
              <MaterialCommunityIcons name="broom" size={24} color={colors.textMuted} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
            hitSlop={10}
          >
            <MaterialCommunityIcons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }} keyboardShouldPersistTaps="handled">
          {langLoaded && !lang ? (
            <Animated.View entering={FadeInUp.duration(200)} style={{ gap: spacing.sm }}>
              <View
                style={[
                  styles.bubble,
                  { alignSelf: 'flex-start', padding: spacing.sm, borderRadius: radii.md, borderBottomLeftRadius: 4, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 },
                ]}
              >
                <AppText variant="body">{"Hi! I'm MarAIne. Which language do you want to use?"}</AppText>
                <AppText variant="body" color="textMuted" style={{ marginTop: 4 }}>
                  Kumusta! Ako si MarAIne. Anong wika ang gusto mo?
                </AppText>
              </View>
              <View style={[styles.wrap, { gap: spacing.xs }]} accessibilityRole="radiogroup">
                <ChoiceChip label="English" selected={false} onPress={() => chooseLang('en')} />
                <ChoiceChip label="Filipino (Tagalog)" selected={false} onPress={() => chooseLang('tl')} />
              </View>
            </Animated.View>
          ) : null}

          {lang && turns.length === 0 ? (
            <View style={{ gap: spacing.sm, paddingTop: spacing.xs }}>
              <AppText variant="body" color="textMuted">
                {UI[lang].welcome}
              </AppText>
              <View style={[styles.wrap, { gap: spacing.xs }]}>
                {STARTERS[lang][state.role ?? 'none'].map((s) => (
                  <ChoiceChip key={s} label={s} selected={false} onPress={() => send(s)} />
                ))}
              </View>
            </View>
          ) : null}

          {turns.map((t, i) => (
            <Animated.View
              key={i}
              entering={FadeInUp.duration(200)}
              style={[
                styles.bubble,
                {
                  borderRadius: radii.md,
                  padding: spacing.sm,
                  alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
                  backgroundColor: t.role === 'user' ? colors.primary : colors.surface,
                  borderColor: colors.border,
                  borderWidth: t.role === 'user' ? 0 : 1.5,
                  borderBottomRightRadius: t.role === 'user' ? 4 : radii.md,
                  borderBottomLeftRadius: t.role === 'user' ? radii.md : 4,
                },
              ]}
            >
              <AppText variant="body" style={t.role === 'user' ? { color: colors.textOnPrimary } : undefined} selectable>
                {t.content}
              </AppText>
              {t.role === 'assistant' ? (
                <View style={[styles.row, styles.meta]}>
                  <Pressable
                    onPress={() => readAloud(i, t.content)}
                    accessibilityRole="button"
                    accessibilityLabel={speaking === i ? UI[lang ?? 'en'].stopRead : UI[lang ?? 'en'].read}
                    hitSlop={10}
                    style={[styles.speaker, { backgroundColor: speaking === i ? colors.selected : colors.background }]}
                  >
                    <MaterialCommunityIcons name={speaking === i ? 'stop' : 'volume-high'} size={18} color={speaking === i ? colors.surface : colors.selected} />
                  </Pressable>
                  {localReplies.has(i) ? (
                    <AppText variant="caption" color="textMuted" style={[styles.source, styles.flex]}>
                      {UI[lang ?? 'en'].local}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
            </Animated.View>
          ))}

          {busy ? <Thinking /> : null}

          {error ? (
            <View style={[styles.row, { gap: spacing.xs, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.accentSoft }]} accessibilityRole="alert">
              <MaterialCommunityIcons name="wifi-off" size={18} color={colors.accentText} />
              <AppText variant="caption" color="accentText" style={styles.flex}>
                {error}
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm, gap: 6 }}>
          {listening && lang ? (
            <Animated.View entering={FadeInUp.duration(160)} style={[styles.row, { gap: spacing.xs, alignSelf: 'center' }]} accessibilityLiveRegion="polite">
              <Dot delay={0} />
              <AppText variant="caption" style={{ color: colors.selected, fontFamily: fonts.sansBold }}>
                {UI[lang].listening}
              </AppText>
            </Animated.View>
          ) : null}
          <View style={[styles.row, { gap: spacing.xs, borderRadius: radii.lg, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingLeft: spacing.md, paddingRight: 6 }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={lang ? UI[lang].placeholder : 'Choose a language first / Pumili muna ng wika'}
              editable={!!lang}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Your question"
              multiline
              maxLength={600}
              style={[styles.input, { color: colors.text }]}
              onSubmitEditing={() => send(text)}
              blurOnSubmit
            />
            {micAvailable ? (
              <Pressable
                onPress={toggleMic}
                disabled={!lang || busy}
                accessibilityRole="button"
                accessibilityLabel={listening ? UI[lang ?? 'en'].stopTalk : UI[lang ?? 'en'].talk}
                accessibilityState={{ selected: listening }}
                style={[styles.send, { backgroundColor: listening ? colors.selected : colors.background, borderWidth: listening ? 0 : 1.5, borderColor: colors.borderStrong }]}
              >
                <MaterialCommunityIcons name={listening ? 'stop' : 'microphone'} size={22} color={listening ? colors.surface : !lang || busy ? colors.textMuted : colors.selected} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => send(text)}
              disabled={busy || !text.trim() || !lang}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={[styles.send, { backgroundColor: busy || !text.trim() ? colors.disabled : colors.primary }]}
            >
              <MaterialCommunityIcons name="send" size={20} color={colors.textOnPrimary} />
            </Pressable>
          </View>
          <AppText variant="caption" color="textMuted" style={styles.note}>
            {UI[lang ?? 'en'].note}
          </AppText>
        </View>
      </View>
    </View>
  );
}

// Three dots that rise in turn, like ripples. Still under reduced motion.
function Thinking() {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      style={[styles.bubble, styles.row, { alignSelf: 'flex-start', gap: 6, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]}
      accessible
      accessibilityLabel="Thinking"
    >
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 160} />
      ))}
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withDelay(delay, withRepeat(withTiming(1, { duration: 420 }), -1, true));
    return () => cancelAnimation(y);
  }, [y, delay, reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -y.value * 4 }], opacity: 0.5 + y.value * 0.5 }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.selected }, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  langPill: { borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 2 },
  langText: { fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 16 },
  source: { fontSize: 12, lineHeight: 16 },
  meta: { gap: 8, marginTop: 6 },
  speaker: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  grip: { position: 'absolute', top: 6, left: '50%', marginLeft: -18, width: 36, height: 4, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  bubble: { maxWidth: '86%' },
  input: { flex: 1, minHeight: 48, maxHeight: 120, paddingVertical: 12, fontSize: 16 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
