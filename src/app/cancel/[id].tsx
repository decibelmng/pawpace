import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { Body, Button, Notice, Screen, Title, ToggleRow } from '@/components/ui';
import { cancellationPreview, runDate } from '@/lib/format';
import { payments } from '@/lib/payments';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { Run } from '@/lib/types';

export default function Cancel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, settings } = useSession();
  const [run, setRun] = useState<Run | null>(null);
  const [weather, setWeather] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('runs').select('*').eq('id', id).single().then(({ data }) => setRun(data as Run));
  }, [id]);
  if (!run || !session || !settings) return <Screen><Body muted>Loading…</Body></Screen>;

  const actor = run.owner_id === session.user.id ? 'owner' : 'runner';
  const preview = cancellationPreview(run, actor, weather, settings);

  const confirm = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('cancel_run', { p_run: run.id, p_weather: weather });
      if (error) throw error;
      await payments('settle_cancel', { run_id: run.id }).catch(() => {});
      router.back();
    } catch (e) {
      Alert.alert('Not cancelled', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Cancel run</Title>
      <Body muted>{runDate(run.scheduled_at)}</Body>
      {run.status === 'confirmed' ? (
        <ToggleRow title="Cancelling for weather" detail="Heat, ice or storms. Always free for both sides, no strike." value={weather} onChange={setWeather} />
      ) : null}
      <Notice tone={preview.tone}>{preview.text}</Notice>
      <Button title="Cancel this run" kind="danger" onPress={confirm} loading={busy} />
      <Button title="Keep the run" kind="line" onPress={() => router.back()} />
    </Screen>
  );
}
