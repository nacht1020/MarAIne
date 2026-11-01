import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText, Button, IconBadge, ScreenContainer, StepHeader, TextField, TextLink } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/hooks/useSync';
import { useTheme } from '@/theme';

type Mode = 'signIn' | 'signUp';

const MIN_PASSWORD = 8;
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function LoginScreen() {
  const router = useRouter();
  const { colors, spacing, radii, tones } = useTheme();
  const { signIn, signUp } = useAuth();
  const { waiting } = useSync();

  // 'onboarding': the last step of setup. 'welcome': "I already have an account" on the first screen.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const inSetup = from === 'onboarding';

  const [mode, setMode] = useState<Mode>('signIn');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const skip = () => router.replace('/home');

  // Where to go once signed in. From the welcome screen the person still answers role and town.
  const done = () => {
    if (from === 'welcome') router.replace('/slides');
    else if (inSetup) router.replace('/home');
    else close();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
  };

  const validate = () => {
    if (mode === 'signUp' && fullName.trim().length < 2) return 'Enter your full name.';
    if (!isEmail(email)) return 'Enter a valid email address.';
    if (!password) return 'Enter your password.';
    if (mode === 'signUp' && password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for your password.`;
    if (mode === 'signUp' && password !== confirm) return 'The two passwords do not match.';
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    if (mode === 'signIn') {
      const result = await signIn(email, password);
      setBusy(false);
      if (result.ok) done();
      else setError(result.message);
      return;
    }
    const result = await signUp({ fullName, email, password, phone });
    setBusy(false);
    if (!result.ok) setError(result.message);
    else if (result.needsConfirm) setCheckEmail(true);
    else done();
  };

  if (checkEmail) {
    return (
      <ScreenContainer
        header={<StepHeader onBack={inSetup ? skip : close} />}
        footer={
          <>
            <Button
              label="I confirmed it, sign in"
              trailingIcon="arrow-forward"
              onPress={() => {
                setCheckEmail(false);
                switchMode('signIn');
              }}
            />
            {inSetup ? <Button label="Do it later" variant="ghost" onPress={skip} /> : null}
          </>
        }
      >
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: spacing.sm, paddingTop: spacing.lg }}>
          <IconBadge icon="email-check-outline" tone="mangrove" size="lg" />
          <AppText variant="title" accessibilityRole="header">
            Check your email
          </AppText>
          <AppText variant="body">
            We sent a link to <AppText variant="bodyStrong">{email.trim()}</AppText>. Open it to confirm your account, then come back and sign in.
          </AppText>
          <AppText variant="caption" color="textMuted">
            No email? Look in Spam or Promotions. Everything you log stays on this phone until you sign in.
          </AppText>
        </Animated.View>
      </ScreenContainer>
    );
  }

  const signingUp = mode === 'signUp';

  return (
    <ScreenContainer
      header={<StepHeader onBack={inSetup ? skip : close} />}
      footer={
        <>
          <Button label={signingUp ? 'Create account' : 'Sign in'} trailingIcon="arrow-forward" loading={busy} onPress={submit} />
          {inSetup ? <Button label="Skip for now" variant="ghost" disabled={busy} accessibilityHint="You can sign in later from More" onPress={skip} /> : null}
        </>
      }
    >
      <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        <IconBadge icon={signingUp ? 'account-plus-outline' : 'account-key-outline'} tone="sea" size="md" />
        <AppText variant="title" accessibilityRole="header">
          {signingUp ? 'Create your account' : 'Sign in'}
        </AppText>
        <AppText variant="body" color="textMuted">
          {signingUp
            ? 'So your catches and reports reach the MAO. Your role and town from setup are added for you.'
            : waiting > 0
              ? `Sign in to send the ${waiting} ${waiting === 1 ? 'record' : 'records'} on this phone to the MAO.`
              : 'Use your MarAIne account.'}
        </AppText>
      </View>

      <Animated.View key={mode} entering={FadeIn.duration(180)} style={{ gap: spacing.md }}>
        {signingUp ? <TextField label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" autoComplete="name" textContentType="name" maxLength={80} /> : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType={signingUp ? 'emailAddress' : 'username'}
        />
        {signingUp ? (
          <TextField
            label="Mobile number (optional)"
            helper="Lets you log catches by SMS later."
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, ''))}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="09XX XXX XXXX"
            maxLength={13}
          />
        ) : null}
        <TextField
          label="Password"
          helper={signingUp ? `At least ${MIN_PASSWORD} characters.` : undefined}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          textContentType={signingUp ? 'newPassword' : 'password'}
          onSubmitEditing={signingUp ? undefined : submit}
        />
        {signingUp ? (
          <TextField label="Type the password again" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
        ) : null}
      </Animated.View>

      {error ? (
        <View
          style={[styles.row, { marginTop: spacing.md, gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.accentSoft }]}
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.accentText} />
          <AppText variant="caption" color="accentText" style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : null}

      <View style={[styles.switch, { marginTop: spacing.lg, padding: spacing.md, borderRadius: radii.md, backgroundColor: signingUp ? colors.surfaceMuted : tones.reef.bg }]}>
        <AppText variant="caption" style={styles.flex}>
          {signingUp ? 'Already have an account?' : 'No account yet?'}
        </AppText>
        <TextLink label={signingUp ? 'Sign in' : 'Sign up'} onPress={() => switchMode(signingUp ? 'signIn' : 'signUp')} />
      </View>

      {signingUp ? (
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
          New accounts start as a fisher account. PIC and Bantay Dagat access is given by the MAO.
        </AppText>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  switch: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
