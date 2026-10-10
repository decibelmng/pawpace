import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { Body, Button, Chip, Chips, Label, Notice, Receipt, Screen, Title, ToggleRow } from '@/components/ui';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { TierCode } from '@/lib/types';

const TIMES = ['6:00', '6:30', '7:00', '7:30', '8:00', '12:00', '14:00', '17:30', '18:00', '18:30', '19:00'];
const label = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export default function LockIn() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { tiers, settings } = useSession();
  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + 1); d.setHours(0, 0, 0, 0); return d;
  }), []);
  const [day, setDay] = useState(0);
  const [time, setTime] = useState('7:00');
  const [tier, setTier] = useState<TierCode>('standard');
  const [extra, setExtra] = useState(false);
  const [gps, setGps] = useState(true);
  const [repeat, setRepeat] = useState(false);
  const [busy, setBusy] = useState(false);

  const t = tiers.find((x) => x.code === tier);
  const s = settings ?? { commission_bps: 1500, booking_fee_cents: 299, gps_addon_cents: 299, extra_dog_cents: 1200, min_runner_age: 18 };
  const base = (t?.price_cents ?? 0) + (extra ? s.extra_dog_cents : 0);
  const gpsC = gps ? s.gps_addon_cents : 0;
  const total = base + s.booking_fee_cents + gpsC;
  const runner = base - Math.round(base * s.commission_bps / 10000);
  const hour = Number(time.split(':')[0]);

  const propose = async () => {
    const when = new Date(days[day]);
    const [h, m] = time.split(':').map(Number);
    when.setHours(h, m);
    setBusy(true);
    const { error } = await supabase.rpc('propose_run', {
      p_match: matchId, p_scheduled_at: when.toISOString(), p_tier_code: tier,
      p_extra_dogs: extra ? 1 : 0, p_gps: gps, p_repeat: repeat,
    });
    setBusy(false);
    if (error) return Alert.alert('Run not sent', errorText(error));
    router.back();
  };

  return (
    <Screen>
      <Title>Lock in run</Title>
      <Body muted>Agree on a time in chat, then send this. The card is held when they accept and charged only after the run.</Body>
      <Label>Day</Label>
      <Chips>{days.map((d, i) => <Chip key={i} label={d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} on={day === i} onPress={() => setDay(i)} />)}</Chips>
      <Label>Start time</Label>
      <Chips>{TIMES.map((x) => <Chip key={x} label={label(x)} on={time === x} onPress={() => setTime(x)} />)}</Chips>
      <Label>Tier</Label>
      <Chips>{tiers.map((x) => <Chip key={x.code} label={`${x.label} · ${x.minutes} min · ${money(x.price_cents)}`} on={tier === x.code} onPress={() => setTier(x.code)} />)}</Chips>
      <ToggleRow title="Second dog" detail={`+${money(s.extra_dog_cents)}`} value={extra} onChange={setExtra} />
      <ToggleRow title="Live GPS tracking" detail={`Watch the run live · +${money(s.gps_addon_cents)}`} value={gps} onChange={setGps} />
      <ToggleRow title="Repeat weekly" detail="Same day and time each week" value={repeat} onChange={setRepeat} />
      <Receipt
        lines={[
          [`${t?.label ?? ''} run`, money(t?.price_cents)],
          ...(extra ? [['Second dog', money(s.extra_dog_cents)] as [string, string]] : []),
          ...(gps ? [['Live GPS', money(gpsC)] as [string, string]] : []),
          ['Booking fee', money(s.booking_fee_cents)],
        ]}
        total={['Owner pays', money(total)]}
        footnote={[`Runner earns (after ${s.commission_bps / 100}%)`, money(runner)]}
      />
      {hour >= 12 && hour <= 16 ? <Notice tone="warn">Midday runs can hit heat advisories. If one is issued, either side can cancel free.</Notice> : null}
      <Button title="Send run" onPress={propose} loading={busy} />
    </Screen>
  );
}
