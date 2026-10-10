import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Body, Button, Label, Screen, Title } from '@/components/ui';
import { WEEKDAYS } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { radius, type, usePalette } from '@/lib/theme';

// Simple blocks most runs fall into; people tap the ones that fit their week.
const SLOTS = [
  { key: 'early', label: '5–7a', start: '05:00', end: '07:00' },
  { key: 'morning', label: '7–9a', start: '07:00', end: '09:00' },
  { key: 'midday', label: '11a–1p', start: '11:00', end: '13:00' },
  { key: 'afternoon', label: '3–5p', start: '15:00', end: '17:00' },
  { key: 'evening', label: '5–8p', start: '17:00', end: '20:00' },
];

export default function Availability() {
  const { dog } = useLocalSearchParams<{ dog?: string }>();
  const { session } = useSession();
  const c = usePalette();
  const [on, setOn] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const forDog = !!dog;

  useEffect(() => {
    (async () => {
      const q = supabase.from('availability_windows').select('weekday, start_time');
      const { data } = forDog ? await q.eq('dog_id', dog) : await q.eq('profile_id', session!.user.id);
      const s = new Set<string>();
      for (const w of data ?? []) {
        const slot = SLOTS.find((x) => w.start_time.startsWith(x.start));
        if (slot) s.add(`${w.weekday}-${slot.key}`);
      }
      setOn(s);
    })();
  }, [dog, forDog, session]);

  const toggle = (k: string) => setOn((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const save = async () => {
    setBusy(true);
    try {
      const del = forDog
        ? await supabase.from('availability_windows').delete().eq('dog_id', dog)
        : await supabase.from('availability_windows').delete().eq('profile_id', session!.user.id);
      if (del.error) throw del.error;
      const rows = [...on].map((k) => {
        const [d, key] = k.split('-');
        const slot = SLOTS.find((x) => x.key === key)!;
        return { weekday: Number(d), start_time: slot.start, end_time: slot.end, ...(forDog ? { dog_id: dog } : { profile_id: session!.user.id }) };
      });
      if (rows.length) {
        const ins = await supabase.from('availability_windows').insert(rows);
        if (ins.error) throw ins.error;
      }
      router.back();
    } catch (e) {
      Alert.alert('Not saved', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{forDog ? 'Run times' : 'When you run'}</Title>
      <Body muted>
        {forDog ? 'Tap the times you want runs. Runners free at those times will show up in your deck.'
          : 'Tap the times you are usually free. Dogs whose owners want those times will show up in your deck.'}
      </Body>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <View style={{ width: 40 }} />
          {SLOTS.map((s) => <Text key={s.key} style={[type.small, { flex: 1, textAlign: 'center', color: c.muted, fontSize: 11 }]}>{s.label}</Text>)}
        </View>
        {WEEKDAYS.map((day, d) => (
          <View key={day} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            <Text style={[type.small, { width: 40, color: c.ink, fontWeight: '700' }]}>{day}</Text>
            {SLOTS.map((s) => {
              const k = `${d}-${s.key}`;
              const sel = on.has(k);
              return (
                <Pressable key={k} onPress={() => toggle(k)} accessibilityRole="checkbox" accessibilityState={{ checked: sel }}
                  accessibilityLabel={`${day} ${s.label}`}
                  style={{ flex: 1, height: 38, borderRadius: radius.sm, backgroundColor: sel ? c.accent : c.surface, borderWidth: 1, borderColor: sel ? c.accent : c.line }} />
              );
            })}
          </View>
        ))}
      </View>
      <Label>{on.size} time blocks selected</Label>
      <Button title="Save times" onPress={save} loading={busy} />
    </Screen>
  );
}
