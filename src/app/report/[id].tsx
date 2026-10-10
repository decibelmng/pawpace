import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Body, Button, Chip, Chips, Field, Label, Notice, Screen, StarRow, Title } from '@/components/ui';
import { payments } from '@/lib/payments';
import { pickReportPhoto } from '@/lib/photos';
import { errorText, supabase } from '@/lib/supabase';

const CATS = [
  ['leash', 'Leash manners'], ['energy', 'Energy and endurance'], ['behavior', 'Behavior around people and dogs'],
  ['pace', 'Pace fit'], ['overall', 'Overall'],
] as const;

export default function Report() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [scores, setScores] = useState<Record<string, number>>({ leash: 5, energy: 5, behavior: 5, pace: 5, overall: 5 });
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState<{ tags: string[]; flagged: boolean } | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('submit_run_report', {
        p_run: id, p_leash: scores.leash, p_energy: scores.energy, p_behavior: scores.behavior,
        p_pace: scores.pace, p_overall: scores.overall, p_notes: notes.trim() || undefined, p_photo: photo ?? undefined,
      });
      if (error) throw error;
      // charge the owner's hold now that the run is complete; payout follows after 24 hours
      await payments('capture_run', { run_id: id }).catch(() => {});
      if (notes.trim()) {
        const { data } = await supabase.functions.invoke('tag-report', { body: { run_id: id } });
        if (data?.tags) { setTags(data); return; }
      }
      router.replace({ pathname: '/run/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Report not sent', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (tags) {
    return (
      <Screen>
        <Title>Report sent</Title>
        <Body muted>The owner can read it now. We tagged your notes:</Body>
        <Chips>{tags.tags.map((t) => <Chip key={t} label={t} />)}</Chips>
        {tags.flagged ? <Notice tone="crit">We flagged a safety note to the owner and the PawPace team.</Notice> : null}
        <Button title="Done" onPress={() => router.replace({ pathname: '/run/[id]', params: { id } })} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Post-run report</Title>
      <Body muted>One tap per row. The owner sees this right away.</Body>
      {CATS.map(([k, l]) => <StarRow key={k} label={l} value={scores[k]} onChange={(n) => setScores((s) => ({ ...s, [k]: n }))} />)}
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline
        placeholder="Great run! Pulled a bit at the start, potty done, water break at the park." />
      <Label>Photo (optional)</Label>
      {photo ? <Notice tone="good">Photo attached.</Notice> : (
        <Button title="Add a photo" kind="ghost" icon="camera" onPress={async () => {
          try { setPhoto(await pickReportPhoto(id)); } catch (e) { Alert.alert('Photo not added', errorText(e)); }
        }} />
      )}
      <Button title="Submit report" onPress={submit} loading={busy} />
    </Screen>
  );
}
