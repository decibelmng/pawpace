import { supabase } from './supabase';
import type { Match, Message, Role } from './types';

export interface Connection {
  match: Match;
  myRole: Role;
  otherId: string;
  otherName: string;
  title: string;            // dog listing title
  photo: string | null;     // runner photo when I'm the owner, dog photo when I'm the runner
  lastMessage: Message | null;
  unread: number;
}

/** Every match and request I'm part of, with the other person's name and photo. */
export async function loadConnections(uid: string): Promise<Connection[]> {
  const { data: ms } = await supabase.from('matches').select('*, listings(title)')
    .or(`owner_id.eq.${uid},runner_id.eq.${uid}`).neq('status', 'blocked').order('created_at', { ascending: false });
  const matches = (ms ?? []) as (Match & { listings: { title: string } | null })[];
  if (!matches.length) return [];

  const otherIds = [...new Set(matches.map((m) => (m.owner_id === uid ? m.runner_id : m.owner_id)))];
  const listingIds = [...new Set(matches.map((m) => m.listing_id))];
  const [{ data: people }, { data: ld }, { data: msgs }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', otherIds),
    supabase.from('listing_dogs').select('listing_id, dog_id').in('listing_id', listingIds),
    supabase.from('messages').select('*').in('match_id', matches.map((m) => m.id)).order('created_at', { ascending: false }).limit(500),
  ]);
  const dogIds = (ld ?? []).map((x) => x.dog_id);
  const { data: photos } = await supabase.from('photos').select('subject_id, path, sort')
    .in('subject_id', [...otherIds, ...dogIds]).order('sort');

  const firstPhoto = (id: string) => photos?.find((p) => p.subject_id === id)?.path ?? null;
  const name = (id: string) => people?.find((p) => p.id === id)?.display_name ?? 'PawPace member';

  return matches.map((m) => {
    const myRole: Role = m.owner_id === uid ? 'owner' : 'runner';
    const otherId = myRole === 'owner' ? m.runner_id : m.owner_id;
    const dogId = ld?.find((x) => x.listing_id === m.listing_id)?.dog_id;
    const mine = (msgs ?? []).filter((x) => x.match_id === m.id) as Message[];
    return {
      match: m,
      myRole,
      otherId,
      otherName: name(otherId),
      title: m.listings?.title ?? 'Dog',
      photo: myRole === 'owner' ? firstPhoto(otherId) : dogId ? firstPhoto(dogId) : null,
      lastMessage: mine[0] ?? null,
      unread: mine.filter((x) => !x.read_at && x.sender_id && x.sender_id !== uid).length,
    };
  });
}
