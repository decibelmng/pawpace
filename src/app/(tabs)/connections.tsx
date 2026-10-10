import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Body, Button, Chip, Label, Screen, Segmented, Title } from '@/components/ui';
import { loadConnections, type Connection } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { space, usePalette } from '@/lib/theme';

export default function Connections() {
  const c = usePalette();
  const { session, mode } = useSession();
  const [tab, setTab] = useState<'matches' | 'requests'>('matches');
  const [items, setItems] = useState<Connection[]>([]);

  const load = useCallback(async () => {
    if (session) setItems(await loadConnections(session.user.id));
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mine = items.filter((i) => i.myRole === mode);
  const matched = mine.filter((i) => i.match.status === 'matched');
  const incoming = mine.filter((i) => i.match.status === 'requested' && i.match.requested_by !== i.myRole);
  const sent = mine.filter((i) => i.match.status === 'requested' && i.match.requested_by === i.myRole);

  const answer = async (i: Connection, yes: boolean) => {
    const runnerId = i.match.runner_id;
    const { data, error } = await supabase.rpc('record_swipe', {
      p_listing: i.match.listing_id, p_runner: runnerId, p_direction: yes ? 'right' : 'left',
    });
    if (error) return Alert.alert('Not saved', errorText(error));
    await load();
    if (data === 'matched') router.push({ pathname: '/chat/[matchId]', params: { matchId: i.match.id } });
  };

  return (
    <Screen>
      <Title>Connections</Title>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'matches', label: `Matches (${matched.length})` },
        { value: 'requests', label: `Requests (${incoming.length})` },
      ]} />

      {tab === 'matches' ? (
        matched.length ? matched.map((i) => (
          <Pressable key={i.match.id} onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: i.match.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: c.line }}>
            <Avatar path={i.photo} name={i.myRole === 'owner' ? i.otherName : i.title} />
            <View style={{ flex: 1 }}>
              <Body bold>{i.myRole === 'owner' ? i.otherName : i.title}</Body>
              <Body small muted>{i.myRole === 'owner' ? `Runs with ${i.title}` : `${i.otherName}'s dog`}</Body>
            </View>
            <Chip label="Matched" tone="good" />
          </Pressable>
        )) : <Body muted>No matches yet. When you both swipe right, you'll land here and chat opens.</Body>
      ) : (
        <>
          {incoming.length ? incoming.map((i) => (
            <View key={i.match.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: c.line }}>
              <Avatar path={i.photo} name={i.myRole === 'owner' ? i.otherName : i.title} />
              <View style={{ flex: 1 }}>
                <Body bold>{i.myRole === 'owner' ? i.otherName : i.title}</Body>
                <Body small muted>{i.myRole === 'owner' ? `wants to run with ${i.title}` : `${i.otherName} wants you to run ${i.title}`}</Body>
              </View>
              <Button title="Pass" kind="line" small onPress={() => answer(i, false)} />
              <Button title="Accept" small onPress={() => answer(i, true)} />
            </View>
          )) : <Body muted>No requests. When someone swipes right on you first, they show up here.</Body>}
          {sent.length ? (
            <>
              <Label>Sent, waiting on them</Label>
              {sent.map((i) => (
                <View key={i.match.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Avatar path={i.photo} name={i.otherName} size={40} />
                  <Body style={{ flex: 1 }}>{i.myRole === 'owner' ? i.otherName : i.title}</Body>
                  <Chip label="Pending" />
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
