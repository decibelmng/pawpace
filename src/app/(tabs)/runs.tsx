import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';

import { RunCard } from '@/components/run-card';
import { Body, Label, Screen, Title } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Run } from '@/lib/types';

export default function Runs() {
  const { session } = useSession();
  const [runs, setRuns] = useState<(Run & { listings: { title: string } | null })[]>([]);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    const uid = session.user.id;
    supabase.from('runs').select('*, listings(title)').or(`owner_id.eq.${uid},runner_id.eq.${uid}`)
      .order('scheduled_at', { ascending: false }).limit(100)
      .then(({ data }) => setRuns((data as never) ?? []));
  }, [session]));

  const upcoming = runs.filter((r) => ['proposed', 'confirmed', 'in_progress'].includes(r.status)).reverse();
  const past = runs.filter((r) => !['proposed', 'confirmed', 'in_progress'].includes(r.status));

  const card = (r: (typeof runs)[number]) => (
    <Pressable key={r.id} onPress={() => router.push({ pathname: '/run/[id]', params: { id: r.id } })}>
      <RunCard run={r} dogName={r.listings?.title ?? 'Dog'} />
    </Pressable>
  );

  return (
    <Screen>
      <Title>Runs</Title>
      {upcoming.length ? upcoming.map(card) : <Body muted>No runs booked. Match, chat, then tap Lock in run.</Body>}
      {past.length ? <><Label>Past</Label>{past.map(card)}</> : null}
    </Screen>
  );
}
