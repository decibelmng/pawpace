import { Text, View } from 'react-native';

import { money, runDate } from '@/lib/format';
import { radius, space, type, usePalette } from '@/lib/theme';
import type { Run } from '@/lib/types';

import { Body, Chip, Notice, Row } from './ui';

export const STATUS: Record<Run['status'], { label: string; tone?: 'good' | 'warn' | 'crit' }> = {
  proposed: { label: 'Waiting for accept', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'good' },
  in_progress: { label: 'Running now', tone: 'crit' },
  completed: { label: 'Completed', tone: 'good' },
  cancelled: { label: 'Cancelled' },
  declined: { label: 'Declined' },
  disputed: { label: 'In review', tone: 'warn' },
};

const TIER: Record<string, string> = { short: 'Short', standard: 'Standard', long: 'Long', endurance: 'Endurance' };

export function RunCard({ run, dogName, children }: { run: Run; dogName: string; children?: React.ReactNode }) {
  const c = usePalette();
  const s = STATUS[run.status];
  const hour = new Date(run.scheduled_at).getHours();
  const midday = hour >= 12 && hour <= 16;
  const open = run.status === 'proposed' || run.status === 'confirmed';
  return (
    <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.lg, padding: space.lg, gap: space.sm, backgroundColor: c.bg }}>
      <Row between><Text style={[{ color: c.muted }, { fontSize: 11, fontWeight: '700', letterSpacing: 1 }]}>RUN</Text><Chip label={s.label} tone={s.tone} /></Row>
      <Text style={[type.title, { color: c.ink, textTransform: 'uppercase' }]}>{runDate(run.scheduled_at)}</Text>
      <Body small muted>
        {TIER[run.tier_code]} · {run.minutes} min or {run.miles} mi · {dogName}{run.extra_dogs ? ` + ${run.extra_dogs} more` : ''}{run.gps_addon ? ' · Live GPS' : ''}{run.repeat_weekly ? ' · Repeats weekly' : ''}
      </Body>
      <Body small>Handoff in person · <Text style={{ fontWeight: '700' }}>Leashed the whole run</Text></Body>
      {midday && open ? <Notice tone="warn">Midday runs can hit heat advisories. Either side can cancel free for weather.</Notice> : null}
      <Row between>
        <Body small>Owner pays <Text style={{ fontWeight: '700' }}>{money(run.owner_total_cents)}</Text></Body>
        <Body small>Runner earns <Text style={{ fontWeight: '700' }}>{money(run.runner_payout_cents)}</Text></Body>
      </Row>
      {children}
    </View>
  );
}
