import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Body, Screen, Title } from '@/components/ui';
import { loadConnections, type Connection } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { space, usePalette } from '@/lib/theme';

export default function Messages() {
  const c = usePalette();
  const { session } = useSession();
  const [items, setItems] = useState<Connection[]>([]);

  useFocusEffect(useCallback(() => {
    if (session) loadConnections(session.user.id).then((x) => setItems(x.filter((i) => i.match.status === 'matched')));
  }, [session]));

  return (
    <Screen>
      <Title>Messages</Title>
      {items.length ? items.map((i) => {
        const name = i.myRole === 'owner' ? i.otherName : `${i.title} · ${i.otherName}`;
        const last = i.lastMessage?.run_id ? 'Run proposal' : i.lastMessage?.body ?? 'Say hi';
        return (
          <Pressable key={i.match.id} onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: i.match.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: c.line }}>
            <Avatar path={i.photo} name={name} />
            <View style={{ flex: 1 }}>
              <Body bold>{name}</Body>
              <Body small muted>{last}</Body>
            </View>
            {i.unread ? (
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{i.unread}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      }) : <Body muted>Chats open once you match. Swipe right in Discover to get started.</Body>}
    </Screen>
  );
}
