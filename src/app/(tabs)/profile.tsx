import { useStripe } from '@stripe/stripe-react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { PhotoGrid } from '@/components/photo-grid';
import { Body, Button, Card, Chip, Chips, Field, Label, Notice, Row, Screen, Segmented, Title } from '@/components/ui';
import { money, paceRange } from '@/lib/format';
import { payments } from '@/lib/payments';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { space, usePalette } from '@/lib/theme';
import type { Dog, Role } from '@/lib/types';

export default function ProfileTab() {
  const c = usePalette();
  const { session, profile, runner, mode, setMode, tiers, settings, refresh } = useSession();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [dogs, setDogs] = useState<(Dog & { photo: string | null })[]>([]);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [hood, setHood] = useState(profile?.neighborhood ?? '');
  const [hasCard, setHasCard] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('dogs').select('*').eq('owner_id', session.user.id).order('created_at');
    const list = (data as Dog[]) ?? [];
    const { data: ph } = list.length
      ? await supabase.from('photos').select('subject_id, path, sort').in('subject_id', list.map((d) => d.id)).order('sort')
      : { data: [] as { subject_id: string; path: string }[] };
    setDogs(list.map((d) => ({ ...d, photo: ph?.find((p) => p.subject_id === d.id)?.path ?? null })));
    const acct = await supabase.from('payment_accounts').select('stripe_customer_id').maybeSingle();
    setHasCard(!!acct.data?.stripe_customer_id);
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveBasics = async () => {
    setBusy('basics');
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), neighborhood: hood.trim() || null }).eq('id', session!.user.id);
    setBusy(null);
    if (error) return Alert.alert('Not saved', errorText(error));
    await refresh();
    Alert.alert('Saved');
  };

  const addCard = async () => {
    setBusy('card');
    try {
      const p = await payments<{ customer: string; ephemeralKey: string; setupIntent: string }>('setup_card');
      const init = await initPaymentSheet({
        merchantDisplayName: 'PawPace',
        customerId: p.customer,
        customerEphemeralKeySecret: p.ephemeralKey,
        setupIntentClientSecret: p.setupIntent,
        applePay: { merchantCountryCode: 'US' },
        returnURL: 'pawpace://stripe-redirect',
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) throw new Error(init.error.message);
      const res = await presentPaymentSheet();
      if (res.error) { if (res.error.code !== 'Canceled') throw new Error(res.error.message); return; }
      setHasCard(true);
      Alert.alert('Card saved', 'It is charged only after each run.');
    } catch (e) {
      Alert.alert('Card not saved', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const enableRole = async (role: Role) => {
    if (role === 'runner') return router.push('/runner-setup');
    await supabase.from('profiles').update({ is_owner: true }).eq('id', session!.user.id);
    await refresh();
    router.push({ pathname: '/dog/[id]', params: { id: 'new' } });
  };

  const deleteAccount = () => Alert.alert('Delete your account?',
    'Your profile, dogs, photos and messages are removed. Past run and payment records are kept without your name, as the law requires.', [
      { text: 'Keep my account', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.functions.invoke('delete-account');
        if (error) return Alert.alert('Not deleted', errorText(error));
        await supabase.auth.signOut();
      } },
    ]);

  if (!session || !profile) return null;
  return (
    <Screen>
      <Title>Profile</Title>

      <Card>
        <Row>
          <Avatar path={null} name={profile.display_name || 'Me'} size={52} />
          <View style={{ flex: 1 }}>
            <Body bold>{profile.display_name}</Body>
            <Body small muted>{[profile.is_owner && 'Dog owner', profile.is_runner && 'Runner'].filter(Boolean).join(' and ')}{profile.neighborhood ? ` · ${profile.neighborhood}` : ''}</Body>
          </View>
        </Row>
        {profile.is_owner && profile.is_runner ? (
          <Segmented<Role> value={mode} onChange={setMode}
            options={[{ value: 'owner', label: 'Owner mode' }, { value: 'runner', label: 'Runner mode' }]} />
        ) : (
          <Button small kind="ghost" title={profile.is_owner ? 'Also run with dogs' : 'Also add my dog'}
            onPress={() => enableRole(profile.is_owner ? 'runner' : 'owner')} />
        )}
        <Body small muted>One account, both roles. You never see your own dog in your runner deck.</Body>
      </Card>

      <Card>
        <Label>Your photos</Label>
        <PhotoGrid subjectType="profile" subjectId={session.user.id} />
      </Card>

      {profile.is_owner ? (
        <Card>
          <Row between><Label>Your dogs</Label><Button small kind="ghost" title="Add a dog" onPress={() => router.push({ pathname: '/dog/[id]', params: { id: 'new' } })} /></Row>
          {dogs.length ? dogs.map((d) => (
            <Pressable key={d.id} onPress={() => router.push({ pathname: '/dog/[id]', params: { id: d.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar path={d.photo} name={d.name} />
              <View style={{ flex: 1 }}>
                <Body bold>{d.name}</Body>
                <Body small muted>{[d.breed, d.size, d.rating_avg ? `${d.rating_avg.toFixed(1)}★ from runners` : null].filter(Boolean).join(' · ')}</Body>
              </View>
              <Body small muted>Edit</Body>
            </Pressable>
          )) : <Body muted>No dogs yet.</Body>}
          <Label>Payment</Label>
          {hasCard ? <Notice tone="good">Card on file. You're charged only after each run.</Notice> : <Notice tone="warn">Add a card before booking your first run.</Notice>}
          <Button title={hasCard ? 'Update card' : 'Add a card'} kind={hasCard ? 'line' : 'primary'} onPress={addCard} loading={busy === 'card'} />
          <Chips><Chip label="PawPace insurance · coming soon" tone="soon" /><Chip label="Upload your own policy · coming soon" tone="soon" /></Chips>
        </Card>
      ) : null}

      {profile.is_runner ? (
        <Card>
          <Label>Running</Label>
          {runner ? (
            <Body small>{paceRange(runner.pace_min_sec, runner.pace_max_sec)}/mi · {runner.miles_min}–{runner.miles_max} mi · Dogs {runner.sizes_accepted.join(', ')} · {runner.runs_completed} runs{runner.rating_avg ? ` · ${runner.rating_avg.toFixed(1)}★` : ''}</Body>
          ) : <Body muted>Finish your runner profile to show up for owners.</Body>}
          <Row>
            <Button small kind="ghost" title="Edit runner profile" onPress={() => router.push('/runner-setup')} />
            <Button small kind="ghost" title="Free times" onPress={() => router.push('/availability')} />
          </Row>
        </Card>
      ) : null}

      <Card>
        <Label>Basics</Label>
        <Field label="First name" value={name} onChangeText={setName} />
        <Field label="Neighborhood" value={hood} onChangeText={setHood} />
        <Button small title="Save" onPress={saveBasics} loading={busy === 'basics'} />
      </Card>

      <Card>
        <Label>{profile.city_id === 'DEN' ? 'Denver' : 'Washington, DC'} prices</Label>
        {tiers.map((t) => <Row key={t.code} between><Body small>{t.label} · {t.minutes} min or {t.miles} mi</Body><Body small bold>{money(t.price_cents)}</Body></Row>)}
        {settings ? <Body small muted>Extra dog +{money(settings.extra_dog_cents)}. Owners add a {money(settings.booking_fee_cents)} booking fee. Tips go to the runner minus Stripe's card fee.</Body> : null}
      </Card>

      <Card>
        <Label>Run rules</Label>
        <Body small>Dogs stay leashed for the whole run. Handoffs happen in person. Either side can cancel free for heat, ice or storms.</Body>
      </Card>

      <Button title="Sign out" kind="line" onPress={() => supabase.auth.signOut()} />
      <Button title="Delete account" kind="danger" onPress={deleteAccount} />
      <Body small muted style={{ textAlign: 'center', color: c.muted }}>PawPace · {profile.city_id === 'DEN' ? 'Denver' : 'Washington, DC'}</Body>
    </Screen>
  );
}
