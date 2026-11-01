import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Same Supabase project as the Huli Ko web app, with the publishable key only. Every write is
// checked by the database's RLS policies and triggers; the app never holds a secret key.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Address of the admin web app (used as the map WebView's base URL).
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');

// null when the build has no keys: the app still works, records just stay on the phone.
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      })
    : null;

// Refresh the session only while the app is in front, as Supabase recommends for React Native.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
