import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { RunCard } from '@/components/run-card';
import { Body, Button, Chip, Chips, Field, Label, Notice, Receipt, Row, Screen } from '@/components/ui';
import { addToAppleCalendar, openGoogleCalendar } from '@/lib/calendar';
import { money } from '@/lib/format';
import { payments } from '@/lib/payments';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { usePalette } from '@/lib/theme';
import type { Run, RunReport } from '@/lib/types';

const REPORT_LABELS: [keyof RunReport, string][] = [
  ['leash_manners', 'Leash manners'], ['energy', 'Energy and endurance'], ['behavior', 'Behavior around people and dogs'],
  ['pace_fit', 'Pace fit'], ['overall', 'Overall'],
];

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const c = usePalette();
  const [run, setRun] = useState<(Run & { listings: { title: string } | null }) | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [rated, setRated] = useState(false);
  const [tipped, setTipped] = useState<number | null>(null);
  const [dispute, setDispute] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setNow(Date.now());
    const [r, rep, rat, tip] = await Promise.all([
      supabase.from('runs').select('*, listings(title)').eq('id', id).single(),
      supabase.from('run_reports').select('*').eq('run_id', id).maybeSingle(),
      supabase.from('ratings').select('run_id').eq('run_id', id).maybeSingle(),
      supabase.from('tips').select('amount_cents').eq('run_id', id).eq('status', 'succeeded').maybeSingle(),
    ]);
    setRun(r.data as never);
    setReport(rep.data as RunReport | null);
    setRated(!!rat.data);
    setTipped(tip.data?.amount_cents ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!run || !session) return <Screen><Body muted>Loading…</Body></Screen>;
  const uid = session.user.id;
  const isOwner = run.owner_id === uid;
  const isRunner = run.runner_id === uid;
  const dogName = run.listings?.title ?? 'Dog';
  const startsIn = (new Date(run.scheduled_at).getTime() - now) / 60_000;

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await load(); } catch (e) { Alert.alert('Not done', errorText(e)); } finally { setBusy(null); }
  };

  const start = () => act('start', async () => {
    const { error } = await supabase.rpc('start_run', { p_run: run.id });
    if (error) throw error;
    router.push({ pathname: '/live/[id]', params: { id: run.id } });
  });

  const tip = (cents: number) => act('tip', async () => {
    const res = await payments<{ runner_receives_cents: number }>('tip', { run_id: run.id, amount_cents: cents });
    Alert.alert('Tip sent', `The runner receives ${money(res.runner_receives_cents)} after Stripe's fee.`);
  });

  const noShow = () => Alert.alert('Report a no-show?', 'You get a full refund and the runner gets a strike.', [
    { text: 'Not yet', style: 'cancel' },
    { text: 'Report no-show', style: 'destructive', onPress: () => act('noshow', async () => {
      const { error } = await supabase.rpc('report_no_show', { p_run: run.id });
      if (error) throw error;
      await payments('settle_cancel', { run_id: run.id }).catch(() => {});
    }) },
  ]);

  const openDispute = () => act('dispute', async () => {
    if (!dispute.trim()) throw new Error('Tell us what happened so we can review it.');
    const { error } = await supabase.rpc('open_dispute', { p_run: run.id, p_details: dispute.trim() });
    if (error) throw error;
    Alert.alert('Dispute opened', 'The runner payout is on hold while our team reviews it.');
  });

  return (
    <Screen>
      <Row>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" hitSlop={10}>
          <SymbolView name="chevron.left" tintColor={c.ink} size={22} />
        </Pressable>
        <Body bold>Run with {dogName}</Body>
      </Row>
      <RunCard run={run} dogName={dogName} />

      {run.status === 'confirmed' ? (
        <>
          <Row>
            <Button small kind="line" title="Apple Calendar" icon="calendar"
              onPress={() => addToAppleCalendar(run, dogName).then(() => Alert.alert('Added to your calendar')).catch((e) => Alert.alert('Not added', errorText(e)))} />
            <Button small kind="line" title="Google Calendar" onPress={() => openGoogleCalendar(run, dogName)} />
          </Row>
          {isRunner ? (
            startsIn <= 120
              ? <Button title="Start run at handoff" icon="figure.run" onPress={start} loading={busy === 'start'} />
              : <Notice tone="info">You can start the run up to 2 hours before {new Date(run.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.</Notice>
          ) : null}
          {isOwner && startsIn < -30 ? <Button title="Runner didn't show" kind="danger" onPress={noShow} loading={busy === 'noshow'} /> : null}
          <Button title="Cancel run" kind="line" onPress={() => router.push({ pathname: '/cancel/[id]', params: { id: run.id } })} />
        </>
      ) : null}

      {run.status === 'proposed' ? <Button title="Withdraw or cancel" kind="line" onPress={() => router.push({ pathname: '/cancel/[id]', params: { id: run.id } })} /> : null}

      {run.status === 'in_progress' ? (
        <Button title={isRunner ? 'Back to the live run' : 'Watch live'} icon="location.fill"
          onPress={() => router.push({ pathname: '/live/[id]', params: { id: run.id } })} />
      ) : null}
      {run.status === 'in_progress' && isRunner && run.ended_at ? (
        <Button title="File post-run report" onPress={() => router.push({ pathname: '/report/[id]', params: { id: run.id } })} />
      ) : null}

      {report ? (
        <View style={{ gap: 8 }}>
          <Label>Post-run report</Label>
          {REPORT_LABELS.map(([k, l]) => (
            <Row key={k} between><Body small>{l}</Body><Body small bold>{'★'.repeat(report[k] as number)}{'☆'.repeat(5 - (report[k] as number))}</Body></Row>
          ))}
          {report.ai_tags.length ? <Chips>{report.ai_tags.map((t) => <Chip key={t} label={t} tone={report.ai_flagged && /heat|sore|injur|slipped|ate/i.test(t) ? 'crit' : undefined} />)}</Chips> : null}
          {report.notes ? <Body small muted>"{report.notes}"</Body> : null}
          {run.distance_mi ? <Body small>{run.distance_mi} miles</Body> : null}
        </View>
      ) : null}

      {run.status === 'completed' && isOwner ? (
        <>
          <Label>Tip {dogName}'s runner</Label>
          {tipped ? <Notice tone="good">You tipped {money(tipped)}. Thank you.</Notice> : (
            <Row>{[300, 500, 1000].map((cents) => <Button key={cents} small kind="ghost" title={money(cents)} onPress={() => tip(cents)} loading={busy === 'tip'} />)}</Row>
          )}
          {!rated ? <Button title="Rate your runner" onPress={() => router.push({ pathname: '/rate/[id]', params: { id: run.id } })} /> : <Notice tone="good">Thanks for rating this run.</Notice>}
          {run.dispute_open_until && Date.parse(run.dispute_open_until) > now ? (
            <>
              <Label>Something wrong?</Label>
              <Field label="What happened" value={dispute} onChangeText={setDispute} multiline placeholder="Describe the problem. Payout is held while we review." />
              <Button title="Open a dispute" kind="danger" onPress={openDispute} loading={busy === 'dispute'} />
            </>
          ) : null}
        </>
      ) : null}

      {run.status === 'completed' || run.status === 'cancelled' || run.status === 'disputed' ? (
        <Receipt
          lines={[
            ['Run', money(run.price_cents + run.extra_dog_cents)],
            ...(run.gps_cents ? [['Live GPS', money(run.gps_cents)] as [string, string]] : []),
            ['Booking fee', money(run.booking_fee_cents)],
            ...(run.refund_cents ? [['Refunded', `−${money(run.refund_cents)}`] as [string, string]] : []),
          ]}
          total={['Owner paid', money(run.owner_total_cents - (run.refund_cents ?? 0))]}
          footnote={['Runner earns', money(run.status === 'cancelled' ? run.runner_comp_cents : run.runner_payout_cents)]}
        />
      ) : null}
      {run.status === 'completed' && isRunner ? (
        <Notice tone="info">{run.payout_released_at ? 'Payout sent to your bank account.' : 'Your payout is sent 24 hours after the run unless the owner opens a dispute.'}</Notice>
      ) : null}
    </Screen>
  );
}
