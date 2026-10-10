import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SwipeCard, type DeckItem } from '@/components/swipe-card';
import { Body, Button, Chip, Chips, Label, Segmented, Title } from '@/components/ui';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { space, type, usePalette } from '@/lib/theme';
import type { DogSize, Listing, ListingCard, Role, RunnerCard } from '@/lib/types';

export default function Discover() {
  const c = usePalette();
  const { profile, runner, mode, setMode, session } = useSession();
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingId, setListingId] = useState<string | null>(null);
  const [deck, setDeck] = useState<DeckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<{ name: string; matchId: string } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [maxMi, setMaxMi] = useState(3);
  const [minRating, setMinRating] = useState(0);
  const [gender, setGender] = useState<string | null>(null);
  const [sizes, setSizes] = useState<DogSize[] | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      if (mode === 'owner') {
        const { data: ls } = await supabase.from('listings').select('*').eq('owner_id', session.user.id).eq('active', true).order('created_at');
        const mine = (ls as Listing[]) ?? [];
        setListings(mine);
        const active = listingId && mine.some((l) => l.id === listingId) ? listingId : mine[0]?.id ?? null;
        setListingId(active);
        if (!active) { setDeck([]); return; }
        const { data, error } = await supabase.rpc('get_runner_deck', {
          p_listing: active, p_max_mi: maxMi, p_min_rating: minRating, p_gender: gender ?? undefined,
        });
        if (error) throw error;
        setDeck(((data as RunnerCard[]) ?? []).map((r) => ({ kind: 'runner' as const, data: r })));
      } else {
        if (!runner) { setDeck([]); return; }
        const { data, error } = await supabase.rpc('get_dog_deck', { p_max_mi: maxMi, p_sizes: sizes ?? undefined });
        if (error) throw error;
        setDeck(((data as ListingCard[]) ?? []).map((l) => ({ kind: 'listing' as const, data: l })));
      }
    } catch (e) {
      Alert.alert('Could not load your deck', errorText(e));
    } finally {
      setLoading(false);
    }
  }, [session, mode, listingId, maxMi, minRating, gender, sizes, runner]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const swipe = async (right: boolean) => {
    const top = deck[0];
    if (!top || !session) return;
    setDeck((d) => d.slice(1));
    const listing = top.kind === 'runner' ? listingId! : top.data.listing_id;
    const runnerId = top.kind === 'runner' ? top.data.profile_id : session.user.id;
    const { data, error } = await supabase.rpc('record_swipe', {
      p_listing: listing, p_runner: runnerId, p_direction: right ? 'right' : 'left',
    });
    if (error) return Alert.alert('Swipe not saved', errorText(error));
    if (data === 'matched') {
      const { data: m } = await supabase.from('matches').select('id').eq('listing_id', listing).eq('runner_id', runnerId).single();
      setMatch({ name: top.kind === 'runner' ? top.data.display_name : top.data.title, matchId: m?.id });
    }
  };

  const canOwner = !!profile?.is_owner;
  const canRun = !!profile?.is_runner;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: space.lg, gap: space.md, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm }}>
          <Text style={{ fontSize: 26, fontWeight: '900', fontStyle: 'italic', color: c.ink }}>PAW<Text style={{ color: c.accent }}>PACE</Text></Text>
          <Pressable onPress={() => setFiltersOpen(true)} accessibilityLabel="Filters" hitSlop={8}
            style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView name="slider.horizontal.3" tintColor={c.ink} size={20} />
          </Pressable>
        </View>

        {canOwner && canRun ? (
          <Segmented<Role> value={mode} onChange={setMode}
            options={[{ value: 'owner', label: 'Find a runner' }, { value: 'runner', label: 'Find a dog' }]} />
        ) : null}

        {mode === 'owner' && listings.length > 1 ? (
          <Chips>{listings.map((l) => <Chip key={l.id} label={l.title} on={l.id === listingId} onPress={() => setListingId(l.id)} />)}</Chips>
        ) : null}

        <View style={{ flex: 1, marginBottom: space.sm }}>
          {loading ? <ActivityIndicator style={{ flex: 1 }} color={c.accent} /> : deck.length ? (
            <>
              {deck[1] ? <SwipeCard key={`b-${keyOf(deck[1])}`} item={deck[1]} back onSwipe={() => {}} /> : null}
              <SwipeCard key={keyOf(deck[0])} item={deck[0]} onSwipe={swipe} />
            </>
          ) : (
            <EmptyDeck mode={mode} hasListing={!!listingId} hasRunner={!!runner} onWiden={() => { setMaxMi(5); setMinRating(0); setGender(null); setSizes(null); }} />
          )}
        </View>

        {deck.length && !loading ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, paddingBottom: space.md }}>
            <RoundButton icon="xmark" label="Pass" onPress={() => swipe(false)} />
            <RoundButton icon="checkmark" label="Run together" primary onPress={() => swipe(true)} />
          </View>
        ) : null}
      </View>

      <Modal visible={!!match} animationType="fade" transparent onRequestClose={() => setMatch(null)}>
        <View style={{ flex: 1, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>
          <Text style={{ fontSize: 64, fontWeight: '900', fontStyle: 'italic', color: '#fff', textAlign: 'center', lineHeight: 62 }}>IT'S A{'\n'}MATCH</Text>
          <Text style={[type.body, { color: '#fff', textAlign: 'center' }]}>You and {match?.name} both swiped right. Chat is open.</Text>
          <View style={{ alignSelf: 'stretch', gap: space.sm }}>
            <Button title={`Message ${match?.name ?? ''}`} kind="dark" onPress={() => {
              const id = match?.matchId; setMatch(null);
              if (id) router.push({ pathname: '/chat/[matchId]', params: { matchId: id } });
            }} />
            <Button title="Keep swiping" kind="line" onPress={() => setMatch(null)} />
          </View>
        </View>
      </Modal>

      <Modal visible={filtersOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFiltersOpen(false)}>
        <View style={{ flex: 1, backgroundColor: c.bg, padding: space.lg, gap: space.lg }}>
          <Title>{mode === 'owner' ? 'Runner filters' : 'Dog filters'}</Title>
          <Label>Distance</Label>
          <Chips>{[1, 2, 3, 5].map((n) => <Chip key={n} label={`Within ${n} mi`} on={maxMi === n} onPress={() => setMaxMi(n)} />)}</Chips>
          {mode === 'owner' ? (
            <>
              <Label>Minimum rating</Label>
              <Chips>{[0, 4.5, 4.8].map((r) => <Chip key={r} label={r ? `${r}+` : 'Any'} on={minRating === r} onPress={() => setMinRating(r)} />)}</Chips>
              <Label>Runner</Label>
              <Chips>
                {[{ v: null, l: 'Anyone' }, { v: 'woman', l: 'Women' }, { v: 'man', l: 'Men' }].map((g) => (
                  <Chip key={g.l} label={g.l} on={gender === g.v} onPress={() => setGender(g.v)} />
                ))}
              </Chips>
              <Body small muted>Only runners whose free times overlap your dog's run times show up.</Body>
            </>
          ) : (
            <>
              <Label>Dog sizes</Label>
              <Chips>
                {(['XS', 'S', 'M', 'L', 'XL'] as DogSize[]).map((s) => {
                  const on = sizes ? sizes.includes(s) : true;
                  return <Chip key={s} label={s} on={on} onPress={() => {
                    const cur = sizes ?? ['XS', 'S', 'M', 'L', 'XL'];
                    setSizes(on ? cur.filter((x) => x !== s) : [...cur, s]);
                  }} />;
                })}
              </Chips>
            </>
          )}
          <Button title="Show results" onPress={() => { setFiltersOpen(false); load(); }} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const keyOf = (i: DeckItem) => (i.kind === 'runner' ? i.data.profile_id : i.data.listing_id);

function RoundButton({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  const c = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? c.accent : c.bg, borderWidth: 1, borderColor: primary ? c.accent : c.line,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}>
      <SymbolView name={icon as never} tintColor={primary ? c.onAccent : c.ink} size={28} />
    </Pressable>
  );
}

function EmptyDeck({ mode, hasListing, hasRunner, onWiden }: { mode: Role; hasListing: boolean; hasRunner: boolean; onWiden: () => void }) {
  if (mode === 'owner' && !hasListing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
        <Title>Add your dog</Title>
        <Body muted>Post your dog to start seeing runners nearby.</Body>
        <Button title="Add a dog" onPress={() => router.push({ pathname: '/dog/[id]', params: { id: 'new' } })} />
      </View>
    );
  }
  if (mode === 'runner' && !hasRunner) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
        <Title>Set up running</Title>
        <Body muted>Add your pace, distances and the dog sizes you can handle.</Body>
        <Button title="Create runner profile" onPress={() => router.push('/runner-setup')} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
      <Title>That's everyone nearby</Title>
      <Body muted>
        {mode === 'owner' ? 'No more runners match right now. Widen your filters or add more run times for your dog.'
          : 'No more dogs match right now. Widen your filters or add more free times.'}
      </Body>
      <Button title="Widen filters" kind="ghost" onPress={onWiden} />
    </View>
  );
}
