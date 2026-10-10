import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

if (!url || !key) {
  console.warn('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.');
}

export const supabase = createClient(url, key, {
  auth: {
    storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the session fresh only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export function photoUrl(path?: string | null) {
  if (!path) return null;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

/** Turns a Supabase/Postgres error into the plain sentence we show people. */
export function errorText(e: unknown): string {
  if (!e) return 'Something went wrong. Try again.';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  return m ?? 'Something went wrong. Try again.';
}
