import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Body, Button, Chip, Chips, Field, Label, Notice, Screen, Title, ToggleRow } from '@/components/ui';
import { age } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';

const CITIES = [{ id: 'DC', name: 'Washington, DC' }, { id: 'DEN', name: 'Denver' }];

export default function Onboarding() {
  const { session, profile, settings, refresh } = useSession();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [city, setCity] = useState(profile?.city_id ?? 'DC');
  const [hood, setHood] = useState(profile?.neighborhood ?? '');
  const [owner, setOwner] = useState(true);
  const [runner, setRunner] = useState(false);
  const [birth, setBirth] = useState('');
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);

  const minAge = settings?.min_runner_age ?? 18;

  const save = async () => {
    if (!session) return;
    if (!name.trim()) return Alert.alert('Add your name', 'Owners and runners see your first name.');
    if (!owner && !runner) return Alert.alert('Pick at least one', 'Choose dog owner, runner, or both.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return Alert.alert('Add your birthday', 'Use the format YYYY-MM-DD.');
    if (runner && age(birth) < minAge) {
      return Alert.alert('Runners must be 18 or older for now',
        'Runners aged 14 to 17 will be able to join with a parent or guardian in a later release.');
    }
    if (!waiver) return Alert.alert('One more step', 'Accept the PawPace safety rules to continue.');

    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      let lat: number | null = null;
      let lng: number | null = null;
      if (perm.granted) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        // stored privately; only used to measure distance, never shown
        lat = Math.round(pos.coords.latitude * 1000) / 1000;
        lng = Math.round(pos.coords.longitude * 1000) / 1000;
      }
      const uid = session.user.id;
      const p1 = await supabase.from('profile_private').update({
        birthdate: birth, home_lat: lat, home_lng: lng, waiver_accepted_at: new Date().toISOString(),
      }).eq('id', uid);
      if (p1.error) throw p1.error;
      const p2 = await supabase.from('profiles').update({
        display_name: name.trim(), city_id: city, neighborhood: hood.trim() || null,
        is_owner: owner, is_runner: runner, onboarded: true,
      }).eq('id', uid);
      if (p2.error) throw p2.error;
      await refresh();
      router.replace('/(tabs)');
      if (owner) router.push({ pathname: '/dog/[id]', params: { id: 'new', next: runner ? 'runner' : '' } });
      else router.push('/runner-setup');
      if (!perm.granted) {
        Alert.alert('Location is off', 'PawPace uses your approximate location to find runners and dogs near you. Turn it on in Settings to see your deck.');
      }
    } catch (e) {
      Alert.alert('Not saved', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Welcome</Title>
      <Body muted>A few basics and you're in.</Body>

      <Field label="First name" value={name} onChangeText={setName} autoComplete="given-name" placeholder="Dave" />
      <Label>City</Label>
      <Chips>{CITIES.map((x) => <Chip key={x.id} label={x.name} on={city === x.id} onPress={() => setCity(x.id)} />)}</Chips>
      <Field label="Neighborhood" value={hood} onChangeText={setHood} placeholder="Dupont Circle" />
      <Field label="Birthday (YYYY-MM-DD)" value={birth} onChangeText={setBirth} placeholder="1985-04-20" keyboardType="numbers-and-punctuation" />

      <Label>I want to</Label>
      <ToggleRow title="Find a runner for my dog" detail="Post your dog and swipe on local runners" value={owner} onChange={setOwner} />
      <ToggleRow title="Get paid to run with dogs" detail={`Runners must be ${minAge} or older`} value={runner} onChange={setRunner} />
      <Body small muted>You can switch between both anytime with one account.</Body>

      <Notice tone="info">
        PawPace rules: dogs stay leashed for the whole run, handoffs happen in person, and either side can cancel free for heat, ice or storms.
      </Notice>
      <ToggleRow title="I accept the safety rules and waiver" value={waiver} onChange={setWaiver} />

      <Button title="Continue" onPress={save} loading={busy} />
    </Screen>
  );
}
