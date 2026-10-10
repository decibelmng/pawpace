import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Body, Button, Field, Screen, StarRow, Title } from '@/components/ui';
import { errorText, supabase } from '@/lib/supabase';

const CATS = [
  ['punctuality', 'Punctuality'], ['communication', 'Communication'], ['care', 'Care of your dog'],
  ['report', 'Report quality'], ['overall', 'Overall'],
] as const;

export default function Rate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [s, setS] = useState<Record<string, number>>({ punctuality: 5, communication: 5, care: 5, report: 5, overall: 5 });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('submit_rating', {
      p_run: id, p_punctuality: s.punctuality, p_communication: s.communication, p_care: s.care,
      p_report: s.report, p_overall: s.overall, p_notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (error) return Alert.alert('Rating not sent', errorText(error));
    router.back();
  };

  return (
    <Screen>
      <Title>Rate your runner</Title>
      <Body muted>Ratings help other owners and push great runners up the deck.</Body>
      {CATS.map(([k, l]) => <StarRow key={k} label={l} value={s[k]} onChange={(n) => setS((x) => ({ ...x, [k]: n }))} />)}
      <Field label="Anything to add" value={notes} onChangeText={setNotes} multiline />
      <Button title="Send rating" onPress={submit} loading={busy} />
    </Screen>
  );
}
