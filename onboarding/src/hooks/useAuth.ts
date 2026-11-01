import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { STORAGE_PREFIX } from '@/constants/app';
import { getMunicipality } from '@/constants/municipalities';
import { supabase } from '@/services/supabase';

import { useOnboarding } from './useOnboarding';

export interface Profile {
  id: string;
  role: 'fisher' | 'pic' | 'admin';
  fullName: string;
  municipality: string | null;
  barangay: string | null;
}

type AuthState =
  | { status: 'loading' }
  // `unavailable`: this build has no Supabase keys, so accounts are off.
  | { status: 'unavailable' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; userId: string; email: string | null; profile: Profile | null };

type SignInResult = { ok: true } | { ok: false; message: string };
// needsConfirm: the project asks new users to confirm their email before the first sign-in.
type SignUpResult = { ok: true; needsConfirm: boolean } | { ok: false; message: string };

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  phone: string;
}

interface AuthContextValue {
  auth: AuthState;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const PROFILE_KEY = `${STORAGE_PREFIX}/profile/v1`;

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<(Profile & { onboardedAt: string | null }) | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, municipality, barangay, onboarded_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    role: data.role,
    fullName: data.full_name ?? '',
    municipality: data.municipality,
    barangay: data.barangay,
    onboardedAt: data.onboarded_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state: onboarding } = useOnboarding();
  const [auth, setAuth] = useState<AuthState>(supabase ? { status: 'loading' } : { status: 'unavailable' });

  // The phone's setup answers fill the profile once (009_onboarding.sql). Town and barangay only
  // fill empty fields so the MAO's registration is never overwritten. Best effort.
  const syncOnboarding = useCallback(
    async (p: Profile & { onboardedAt: string | null }) => {
      if (!supabase || p.onboardedAt || !onboarding.completed) return;
      const town = onboarding.municipality ? getMunicipality(onboarding.municipality)?.name : undefined;
      const barangay = onboarding.barangay.trim();
      await supabase
        .from('profiles')
        .update({
          onboarded_at: new Date().toISOString(),
          preferred_language: 'en',
          ...(onboarding.role === 'fisherfolk' && { requested_role: 'fisher' }),
          ...(!p.municipality && town && { municipality: town }),
          ...(!p.barangay && barangay && { barangay }),
        })
        .eq('id', p.id);
    },
    [onboarding],
  );

  const loadUser = useCallback(
    async (userId: string, email: string | null) => {
      let profile: Profile | null = null;
      try {
        const fresh = await fetchProfile(userId);
        if (fresh) {
          const { onboardedAt: _, ...rest } = fresh;
          profile = rest;
          AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile)).catch(() => {});
          syncOnboarding(fresh).catch(() => {});
        }
      } catch {
        // No signal: use the copy saved at the last login.
        try {
          const cached = JSON.parse((await AsyncStorage.getItem(PROFILE_KEY)) ?? 'null') as Profile | null;
          profile = cached?.id === userId ? cached : null;
        } catch {
          profile = null;
        }
      }
      setAuth({ status: 'signedIn', userId, email, profile });
    },
    [syncOnboarding],
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      if (user) loadUser(user.id, user.email ?? null);
      else setAuth({ status: 'signedOut' });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setAuth({ status: 'signedOut' });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // Runs once; loadUser changing with onboarding answers must not re-run the session check.
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      if (!supabase) return { ok: false, message: 'Accounts are not set up in this build.' };
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) {
        if (error?.message === 'Invalid login credentials') return { ok: false, message: 'Wrong email or password.' };
        return { ok: false, message: 'Could not sign in. Check your signal and try again.' };
      }
      let profile: Awaited<ReturnType<typeof fetchProfile>>;
      try {
        profile = await fetchProfile(data.user.id);
      } catch {
        await supabase.auth.signOut({ scope: 'local' });
        return { ok: false, message: 'Could not sign in. Check your signal and try again.' };
      }
      if (!profile) {
        await supabase.auth.signOut({ scope: 'local' });
        return { ok: false, message: 'This account is not registered yet. Please see the MAO.' };
      }
      if (profile.role === 'admin') {
        await supabase.auth.signOut({ scope: 'local' });
        return { ok: false, message: 'Admin accounts use the MarAIne dashboard on a computer. Sign in here with a fisher, Bantay Dagat or tourist account.' };
      }
      await loadUser(data.user.id, data.user.email ?? null);
      return { ok: true };
    },
    [loadUser],
  );

  // New accounts start as 'fisher' (handle_new_user in 009_onboarding.sql); the setup answers ride
  // along as metadata so the profile is filled at once. Only the MAO can grant PIC or admin.
  const signUp = useCallback(
    async ({ fullName, email, password, phone }: SignUpInput): Promise<SignUpResult> => {
      if (!supabase) return { ok: false, message: 'Accounts are not set up in this build.' };
      const town = onboarding.municipality ? getMunicipality(onboarding.municipality)?.name : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim() || undefined,
            municipality: town,
            barangay: onboarding.barangay.trim() || undefined,
            language: 'en',
            ...(onboarding.role === 'fisherfolk' && { requested_role: 'fisher' }),
          },
        },
      });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) return { ok: false, message: 'This email already has an account. Sign in instead.' };
        if (/password/i.test(error.message)) return { ok: false, message: 'Choose a stronger password: at least 8 characters.' };
        return { ok: false, message: 'Could not create the account. Check your signal and try again.' };
      }
      if (!data.user) return { ok: false, message: 'Could not create the account. Try again.' };
      if (!data.session) return { ok: true, needsConfirm: true };
      await loadUser(data.user.id, data.user.email ?? null);
      return { ok: true, needsConfirm: false };
    },
    [onboarding, loadUser],
  );

  const signOut = useCallback(async () => {
    try {
      await supabase?.auth.signOut({ scope: 'local' });
    } catch {
      // Offline: the local session is still cleared.
    }
    await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
    setAuth(supabase ? { status: 'signedOut' } : { status: 'unavailable' });
  }, []);

  const value = useMemo(() => ({ auth, signIn, signUp, signOut }), [auth, signIn, signUp, signOut]);
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
