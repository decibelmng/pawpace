import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { RunCard } from '@/components/run-card';
import { Body, Button, Row } from '@/components/ui';
import { addToAppleCalendar, openGoogleCalendar } from '@/lib/calendar';
import { payments } from '@/lib/payments';
import { loadConnections, type Connection } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { radius, space, usePalette } from '@/lib/theme';
import type { Message, Run } from '@/lib/types';

export default function Chat() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { session } = useSession();
  const c = usePalette();
  const uid = session?.user.id;
  const [conn, setConn] = useState<Connection | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [text, setText] = useState('');
  const list = useRef<FlatList<Message>>(null);

  const loadRuns = useCallback(async () => {
    const { data } = await supabase.from('runs').select('*').eq('match_id', matchId);
    setRuns(Object.fromEntries(((data as Run[]) ?? []).map((r) => [r.id, r])));
  }, [matchId]);

  useEffect(() => {
    if (!uid) return;
    loadConnections(uid).then((all) => setConn(all.find((x) => x.match.id === matchId) ?? null));
    supabase.from('messages').select('*').eq('match_id', matchId).order('created_at')
      .then(({ data }) => setMsgs((data as Message[]) ?? []));
    loadRuns();
    supabase.rpc('mark_messages_read', { p_match: matchId });

    const channel = supabase.channel(`match-${matchId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (p) => {
          setMsgs((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m, p.new as Message]));
          supabase.rpc('mark_messages_read', { p_match: matchId });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs', filter: `match_id=eq.${matchId}` },
        () => loadRuns())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [uid, matchId, loadRuns]);

  useEffect(() => { setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50); }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || !uid) return;
    setText('');
    const { data, error } = await supabase.from('messages').insert({ match_id: matchId, sender_id: uid, body }).select('*').single();
    if (error) { setText(body); return Alert.alert('Message not sent', errorText(error)); }
    setMsgs((m) => (m.some((x) => x.id === data.id) ? m : [...m, data as Message]));
  };

  const respond = async (run: Run, accept: boolean) => {
    const { error } = await supabase.rpc('respond_run', { p_run: run.id, p_accept: accept });
    if (error) return Alert.alert('Not saved', errorText(error));
    await loadRuns();
    if (accept) {
      try { await payments('authorize_run', { run_id: run.id }); } catch (e) {
        Alert.alert('Run confirmed', `The card hold will be retried before the run. ${errorText(e)}`);
      }
    }
  };

  const more = () => {
    if (!conn) return;
    const options = ['Report', `Block ${conn.otherName}`, 'Cancel'];
    const act = async (i: number) => {
      if (i === 0) {
        const { error } = await supabase.from('user_reports').insert({
          reporter_id: uid, target_profile_id: conn.otherId, match_id: matchId, reason: 'chat_report',
        });
        Alert.alert(error ? 'Report not sent' : 'Report sent', error ? errorText(error) : 'Our team will review this conversation.');
      }
      if (i === 1) {
        Alert.alert(`Block ${conn.otherName}?`, 'You will not see each other again, and this chat closes.', [
          { text: 'Keep', style: 'cancel' },
          { text: 'Block', style: 'destructive', onPress: async () => {
            const { error } = await supabase.rpc('block_user', { p_other: conn.otherId });
            if (error) Alert.alert('Not blocked', errorText(error)); else router.back();
          } },
        ]);
      }
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2, destructiveButtonIndex: 1 }, act);
    else Alert.alert('Options', undefined, [{ text: 'Report', onPress: () => act(0) }, { text: 'Block', onPress: () => act(1) }, { text: 'Cancel', style: 'cancel' }]);
  };

  const name = conn ? (conn.myRole === 'owner' ? conn.otherName : `${conn.title} · ${conn.otherName}`) : '';
  const dogName = conn?.title ?? 'your dog';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row style={{ padding: space.md, borderBottomWidth: 1, borderColor: c.line }}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Back" hitSlop={10}>
            <SymbolView name="chevron.left" tintColor={c.ink} size={22} />
          </Pressable>
          <Avatar path={conn?.photo} name={name || '?'} size={36} />
          <View style={{ flex: 1 }}>
            <Body bold>{name}</Body>
            <Body small muted>Phone and email stay private</Body>
          </View>
          <Pressable onPress={more} accessibilityLabel="Report or block" hitSlop={10}>
            <SymbolView name="ellipsis.circle" tintColor={c.ink} size={24} />
          </Pressable>
        </Row>

        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
          renderItem={({ item: m }) => {
            if (m.run_id) {
              const run = runs[m.run_id];
              if (!run) return null;
              const mineProposal = run.proposed_by === uid;
              return (
                <RunCard run={run} dogName={dogName}>
                  {run.status === 'proposed' && !mineProposal ? (
                    <Row>
                      <View style={{ flex: 1 }}><Button title="Decline" kind="line" onPress={() => respond(run, false)} /></View>
                      <View style={{ flex: 1 }}><Button title="Accept" onPress={() => respond(run, true)} /></View>
                    </Row>
                  ) : null}
                  {run.status === 'proposed' && mineProposal ? <Body small muted>Sent. Waiting for {conn?.otherName.split(' ')[0]} to accept.</Body> : null}
                  {run.status === 'confirmed' ? (
                    <Row>
                      <Button small kind="line" title="Apple Calendar" icon="calendar"
                        onPress={() => addToAppleCalendar(run, dogName).then(() => Alert.alert('Added to your calendar')).catch((e) => Alert.alert('Not added', errorText(e)))} />
                      <Button small kind="line" title="Google Calendar" onPress={() => openGoogleCalendar(run, dogName)} />
                    </Row>
                  ) : null}
                  {run.status !== 'proposed' ? <Button small kind="ghost" title="Open run" onPress={() => router.push({ pathname: '/run/[id]', params: { id: run.id } })} /> : null}
                </RunCard>
              );
            }
            if (!m.sender_id) return <Text style={{ alignSelf: 'center', color: c.muted, fontSize: 12, textAlign: 'center', paddingHorizontal: space.lg }}>{m.body}</Text>;
            const me = m.sender_id === uid;
            return (
              <View style={{
                alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: me ? c.accent : c.surface,
                paddingVertical: 9, paddingHorizontal: 12, borderRadius: 16,
                borderBottomRightRadius: me ? 4 : 16, borderBottomLeftRadius: me ? 16 : 4,
              }}>
                <Text style={{ color: me ? c.onAccent : c.ink, fontSize: 15 }}>{m.body}</Text>
              </View>
            );
          }}
        />

        <Row style={{ padding: space.md, borderTopWidth: 1, borderColor: c.line }}>
          <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={c.muted}
            onSubmitEditing={send} returnKeyType="send"
            style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: c.ink, fontSize: 15 }} />
          <Pressable onPress={send} accessibilityLabel="Send" hitSlop={6}><SymbolView name="paperplane.fill" tintColor={c.accent} size={24} /></Pressable>
          <Pressable onPress={() => router.push({ pathname: '/lock-in/[matchId]', params: { matchId } })}
            accessibilityRole="button" style={{ backgroundColor: c.ink, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <SymbolView name="bolt.fill" tintColor={c.bg} size={14} />
            <Text style={{ color: c.bg, fontWeight: '700', fontSize: 13 }}>Lock in run</Text>
          </Pressable>
        </Row>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
