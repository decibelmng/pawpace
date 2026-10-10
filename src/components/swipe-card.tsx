import { Image } from 'expo-image';
import { useState } from 'react';
import { Animated, Dimensions, PanResponder, Text, View } from 'react-native';

import { ENERGY_LABEL, money, paceRange } from '@/lib/format';
import { photoUrl } from '@/lib/supabase';
import { radius, space, type, usePalette } from '@/lib/theme';
import type { ListingCard, RunnerCard } from '@/lib/types';

import { Body, Chip, Chips, Stat, Stats } from './ui';

const W = Dimensions.get('window').width;
const THRESHOLD = 110;

export type DeckItem = { kind: 'runner'; data: RunnerCard } | { kind: 'listing'; data: ListingCard };

/** The top card follows the finger; past the threshold it flies off and reports the swipe. */
export function SwipeCard({ item, onSwipe, back }: { item: DeckItem; onSwipe: (right: boolean) => void; back?: boolean }) {
  const c = usePalette();
  // Animated values and the gesture handler are created once per card and never replaced.
  const [anim] = useState(() => {
    const pos = new Animated.ValueXY();
    const fling = (right: boolean, done: (r: boolean) => void) => {
      Animated.timing(pos, { toValue: { x: right ? W * 1.4 : -W * 1.4, y: 0 }, duration: 220, useNativeDriver: false })
        .start(() => done(right));
    };
    return {
      pos,
      fling,
      rotate: pos.x.interpolate({ inputRange: [-W, 0, W], outputRange: ['-18deg', '0deg', '18deg'] }),
      yes: pos.x.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' }),
      no: pos.x.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' }),
    };
  });
  const [responder] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8,
    onPanResponderMove: Animated.event([null, { dx: anim.pos.x, dy: anim.pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_e, g) => {
      if (g.dx > THRESHOLD) anim.fling(true, onSwipe);
      else if (g.dx < -THRESHOLD) anim.fling(false, onSwipe);
      else Animated.spring(anim.pos, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  }));
  const { pos, rotate, yes, no } = anim;

  const photo = item.kind === 'runner' ? photoUrl(item.data.photo_path) : photoUrl(item.data.dogs?.[0]?.photo_path);
  const placeholder = item.kind === 'runner'
    ? item.data.display_name.slice(0, 2).toUpperCase()
    : item.data.title.slice(0, 2).toUpperCase();

  return (
    <Animated.View
      {...(back ? {} : responder.panHandlers)}
      style={{
        position: 'absolute', inset: 0, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.bg,
        borderWidth: 1, borderColor: c.line,
        transform: back ? [{ scale: 0.95 }, { translateY: 14 }] : [{ translateX: pos.x }, { translateY: pos.y }, { rotate }],
        opacity: back ? 0.7 : 1,
      }}>
      <View style={{ height: '48%', backgroundColor: c.accent }}>
        {photo ? <Image source={{ uri: photo }} style={{ flex: 1 }} contentFit="cover" transition={150} /> : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 96, fontWeight: '900', fontStyle: 'italic', color: '#fff' }}>{placeholder}</Text>
          </View>
        )}
        {item.data.requested_you ? (
          <View style={{ position: 'absolute', top: 14, right: 14, backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={[type.small, { color: c.accent, fontWeight: '700' }]}>Wants to run with you</Text>
          </View>
        ) : null}
        {!back ? (
          <>
            <Animated.Text style={[stamp, { left: 18, color: c.good, borderColor: c.good, opacity: yes, transform: [{ rotate: '-12deg' }] }]}>RUN</Animated.Text>
            <Animated.Text style={[stamp, { right: 18, color: c.crit, borderColor: c.crit, opacity: no, transform: [{ rotate: '12deg' }] }]}>PASS</Animated.Text>
          </>
        ) : null}
      </View>
      <View style={{ padding: space.lg, gap: space.md }}>
        {item.kind === 'runner' ? <RunnerBody r={item.data} /> : <ListingBody l={item.data} />}
      </View>
    </Animated.View>
  );
}

const stamp = {
  position: 'absolute' as const, top: 22, borderWidth: 3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2,
  fontSize: 30, fontWeight: '900' as const, backgroundColor: 'rgba(255,255,255,.9)', overflow: 'hidden' as const,
};

function RunnerBody({ r }: { r: RunnerCard }) {
  const c = usePalette();
  return (
    <>
      <View>
        <Text style={[type.display, { color: c.ink, fontSize: 30 }]}>{r.display_name}</Text>
        <Body small muted>{r.distance_mi} mi away{r.neighborhood ? ` · ${r.neighborhood}` : ''}</Body>
      </View>
      <Stats>
        <Stat value={paceRange(r.pace_min_sec, r.pace_max_sec)} label="min / mile" />
        <Stat value={r.miles_min && r.miles_max ? `${r.miles_min}–${r.miles_max}` : '—'} label="miles per run" />
        <Stat value={r.rating_avg ? r.rating_avg.toFixed(1) : 'New'} label={`${r.runs_completed} runs`} />
      </Stats>
      <Chips>
        {r.styles.slice(0, 3).map((s) => <Chip key={s} label={s} />)}
        <Chip label={`Dogs ${r.sizes_accepted.join(', ')}`} />
        {r.background_checked ? <Chip label="Background checked" tone="good" /> : <Chip label="Background check · coming soon" tone="soon" />}
      </Chips>
      {r.bio ? <Body small muted>{r.bio}</Body> : null}
    </>
  );
}

function ListingBody({ l }: { l: ListingCard }) {
  const c = usePalette();
  const d = l.dogs?.[0];
  const flags = (l.dogs ?? []).flatMap((x) => [
    x.reactive_dogs && 'Reactive to dogs', x.reactive_people && 'Reactive to people',
    x.reactive_bikes && 'Reactive to bikes', x.heat_sensitive && 'Heat sensitive',
  ]).filter(Boolean) as string[];
  const yrs = d?.birth_year ? `${new Date().getFullYear() - d.birth_year} yrs · ` : '';
  return (
    <>
      <View>
        <Text style={[type.display, { color: c.ink, fontSize: 30 }]}>{l.title}</Text>
        <Body small muted>
          {l.dogs.length > 1 ? `${l.dogs.length} dogs · ` : `${d?.breed ?? 'Dog'} · ${yrs}`}{l.distance_mi} mi away{l.neighborhood ? ` · ${l.neighborhood}` : ''}
        </Body>
      </View>
      <Stats>
        <Stat value={l.dogs.map((x) => x.size).join(' + ')} label="size" />
        <Stat value={d ? ENERGY_LABEL[d.energy] : '—'} label="energy" />
        <Stat value={d?.run_minutes_max ? `${d.run_minutes_max} min` : '—'} label="run wanted" />
      </Stats>
      <Chips>
        {flags.map((f) => <Chip key={f} label={f} tone="warn" />)}
        {d?.leash_manners ? <Chip label={`Leash manners ${d.leash_manners}/5`} /> : null}
        <Chip label={`Earn from ${money(Math.round(l.from_price_cents * 0.85))}`} tone="good" />
      </Chips>
    </>
  );
}
