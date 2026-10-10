import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { PhotoGrid } from '@/components/photo-grid';
import { Body, Button, Chip, Chips, Field, Label, Notice, Screen, Title } from '@/components/ui';
import { payments } from '@/lib/payments';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { DogSize } from '@/lib/types';

const STYLES = ['Easy', 'Tempo', 'Intervals', 'Trail', 'Long run'];
const SIZES: DogSize[] = ['XS', 'S', 'M', 'L', 'XL'];
const GENDERS = [
  { v: 'woman', l: 'Woman' }, { v: 'man', l: 'Man' }, { v: 'nonbinary', l: 'Nonbinary' }, { v: 'prefer_not', l: 'Prefer not to say' },
];

const toSec = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fromSec = (n: number | null) => (n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '');

export default function RunnerSetup() {
  const { session, runner, profile, refresh } = useSession();
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [fast, setFast] = useState(fromSec(runner?.pace_min_sec ?? 480));
  const [slow, setSlow] = useState(fromSec(runner?.pace_max_sec ?? 570));
  const [milesMin, setMilesMin] = useState(String(runner?.miles_min ?? 3));
  const [milesMax, setMilesMax] = useState(String(runner?.miles_max ?? 6));
  const [styles, setStyles] = useState<string[]>(runner?.styles ?? ['Easy']);
  const [sizes, setSizes] = useState<DogSize[]>(runner?.sizes_accepted ?? ['S', 'M', 'L']);
  const [maxDogs, setMaxDogs] = useState(runner?.max_dogs ?? 1);
  const [radius, setRadius] = useState(runner?.service_radius_mi ?? 2);
  const [gender, setGender] = useState(runner?.gender ?? 'prefer_not');
  const [busy, setBusy] = useState(false);
  const [payoutsReady, setPayoutsReady] = useState(false);

  useEffect(() => {
    supabase.from('payment_accounts').select('payouts_enabled').maybeSingle()
      .then(({ data }) => setPayoutsReady(!!data?.payouts_enabled));
  }, []);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    if (!session) return;
    const a = toSec(fast); const b = toSec(slow);
    if (!a || !b) return Alert.alert('Check your pace', 'Use minutes and seconds per mile, like 8:30.');
    if (!sizes.length) return Alert.alert('Pick dog sizes', 'Choose at least one size you can run with.');
    setBusy(true);
    try {
      const row = {
        profile_id: session.user.id, gender, pace_min_sec: Math.min(a, b), pace_max_sec: Math.max(a, b),
        miles_min: Number(milesMin) || null, miles_max: Number(milesMax) || null,
        styles, sizes_accepted: sizes, max_dogs: maxDogs, service_radius_mi: radius, active: true,
      };
      const r = await supabase.from('runner_profiles').upsert(row);
      if (r.error) throw r.error;
      const p = await supabase.from('profiles').update({ bio: bio.trim() || null, is_runner: true }).eq('id', session.user.id);
      if (p.error) throw p.error;
      await refresh();
      Alert.alert('Runner profile saved', 'Add photos and your free times so owners can find you.');
    } catch (e) {
      Alert.alert('Not saved', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const payouts = async () => {
    try {
      const { url } = await payments<{ url: string }>('onboard_runner');
      await WebBrowser.openBrowserAsync(url);
      const { data } = await supabase.from('payment_accounts').select('payouts_enabled').maybeSingle();
      setPayoutsReady(!!data?.payouts_enabled);
    } catch (e) {
      Alert.alert('Payouts not available yet', errorText(e));
    }
  };

  return (
    <Screen>
      <Title>Runner profile</Title>
      <Field label="About you" value={bio} onChangeText={setBio} multiline placeholder="Marathoner, runs Rock Creek most mornings, grew up with Labs." />
      <Label>Pace range (min per mile)</Label>
      <Chips>
        <Field label="Fastest" value={fast} onChangeText={setFast} placeholder="8:00" style={{ width: 110 }} />
        <Field label="Easiest" value={slow} onChangeText={setSlow} placeholder="9:30" style={{ width: 110 }} />
      </Chips>
      <Label>Miles per run</Label>
      <Chips>
        <Field label="From" value={milesMin} onChangeText={setMilesMin} keyboardType="decimal-pad" style={{ width: 110 }} />
        <Field label="To" value={milesMax} onChangeText={setMilesMax} keyboardType="decimal-pad" style={{ width: 110 }} />
      </Chips>
      <Label>Running style</Label>
      <Chips>{STYLES.map((s) => <Chip key={s} label={s} on={styles.includes(s)} onPress={() => setStyles(toggle(styles, s))} />)}</Chips>
      <Label>Dog sizes you can handle</Label>
      <Chips>{SIZES.map((s) => <Chip key={s} label={s} on={sizes.includes(s)} onPress={() => setSizes(toggle(sizes, s))} />)}</Chips>
      <Label>Dogs per run</Label>
      <Chips>{[1, 2, 3].map((n) => <Chip key={n} label={`Up to ${n}`} on={maxDogs === n} onPress={() => setMaxDogs(n)} />)}</Chips>
      <Label>How far you'll go for a pickup</Label>
      <Chips>{[1, 2, 3, 5].map((n) => <Chip key={n} label={`${n} mi`} on={radius === n} onPress={() => setRadius(n)} />)}</Chips>
      <Label>Gender (owners can filter on this)</Label>
      <Chips>{GENDERS.map((g) => <Chip key={g.v} label={g.l} on={gender === g.v} onPress={() => setGender(g.v)} />)}</Chips>

      <Button title={runner ? 'Save changes' : 'Save runner profile'} onPress={save} loading={busy} />

      {runner && session ? (
        <>
          <Label>Your photos</Label>
          <PhotoGrid subjectType="profile" subjectId={session.user.id} />
          <Button title="Set when you run" kind="ghost" icon="calendar" onPress={() => router.push('/availability')} />
          <Label>Payouts</Label>
          {payoutsReady
            ? <Notice tone="good">Payouts are set up. Earnings arrive 24 hours after each run.</Notice>
            : <Notice tone="warn">Set up payouts with Stripe to get paid. It takes about 3 minutes.</Notice>}
          <Button title={payoutsReady ? 'Update payout details' : 'Set up payouts'} kind={payoutsReady ? 'line' : 'primary'} onPress={payouts} />
          <Chips>
            <Chip label="Background check · coming soon" tone="soon" />
          </Chips>
          <Button title="Done" kind="line" onPress={() => router.back()} />
        </>
      ) : null}
      <Body small muted>Runners must be 18 or older. Dogs stay leashed for every run.</Body>
    </Screen>
  );
}
