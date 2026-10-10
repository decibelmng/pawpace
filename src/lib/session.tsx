import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import type { Profile, Role, RunnerProfile, Settings, Tier } from './types';

interface SessionState {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  runner: RunnerProfile | null;
  mode: Role;
  setMode: (m: Role) => void;
  tiers: Tier[];
  settings: Settings | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);
const MODE_KEY = 'pawpace.mode';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [runner, setRunner] = useState<RunnerProfile | null>(null);
  const [mode, setModeState] = useState<Role>('owner');
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setRunner(null);
      return;
    }
    const uid = s.user.id;
    const [p, r, st] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('runner_profiles').select('*').eq('profile_id', uid).maybeSingle(),
      supabase.from('platform_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    const prof = (p.data as Profile) ?? null;
    setProfile(prof);
    setRunner((r.data as RunnerProfile) ?? null);
    setSettings((st.data as Settings) ?? null);
    const t = await supabase.from('pricing_tiers').select('*')
      .eq('city_id', prof?.city_id ?? 'DC').eq('active', true).order('sort');
    setTiers((t.data as Tier[]) ?? []);
    const saved = (await AsyncStorage.getItem(MODE_KEY).catch(() => null)) as Role | null;
    if (saved === 'runner' && prof?.is_runner) setModeState('runner');
    else if (saved === 'owner' && prof?.is_owner) setModeState('owner');
    else setModeState(prof?.is_owner ? 'owner' : 'runner');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const setMode = (m: Role) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
  };

  return (
    <Ctx.Provider value={{
      session, loading, profile, runner, mode, setMode, tiers, settings,
      refresh: () => load(session),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
