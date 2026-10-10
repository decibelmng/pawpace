import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { PhotoGrid } from '@/components/photo-grid';
import { Body, Button, Chip, Chips, Field, Label, Notice, Screen, StarRow, Title, ToggleRow } from '@/components/ui';
import { ENERGY_LABEL, SIZE_LABEL } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import type { Dog, DogSize, Energy, TierCode } from '@/lib/types';

const SIZES: DogSize[] = ['XS', 'S', 'M', 'L', 'XL'];
const ENERGIES: Energy[] = ['low', 'medium', 'high', 'very_high'];
const LENGTHS: { code: TierCode; label: string; min: number; max: number }[] = [
  { code: 'short', label: '20 min', min: 15, max: 20 },
  { code: 'standard', label: '30 min', min: 25, max: 35 },
  { code: 'long', label: '45 min', min: 40, max: 50 },
  { code: 'endurance', label: '60 min', min: 55, max: 70 },
];

export default function DogEditor() {
  const { id, next } = useLocalSearchParams<{ id: string; next?: string }>();
  const { session } = useSession();
  const isNew = id === 'new';
  const [dogId, setDogId] = useState<string | null>(isNew ? null : id);
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [born, setBorn] = useState('');
  const [size, setSize] = useState<DogSize>('M');
  const [energy, setEnergy] = useState<Energy>('high');
  const [length, setLength] = useState<TierCode>('standard');
  const [leash, setLeash] = useState(4);
  const [rDogs, setRDogs] = useState(false);
  const [rPeople, setRPeople] = useState(false);
  const [rBikes, setRBikes] = useState(false);
  const [heat, setHeat] = useState(false);
  const [health, setHealth] = useState('');
  const [vet, setVet] = useState('');
  const [emergency, setEmergency] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data } = await supabase.from('dogs').select('*').eq('id', id).single();
      const d = data as Dog | null;
      if (!d) return;
      setName(d.name); setBreed(d.breed ?? ''); setBorn(d.birth_year ? String(d.birth_year) : '');
      setSize(d.size); setEnergy(d.energy); setLeash(d.leash_manners ?? 4);
      setRDogs(d.reactive_dogs); setRPeople(d.reactive_people); setRBikes(d.reactive_bikes); setHeat(d.heat_sensitive);
      const len = LENGTHS.find((l) => d.run_minutes_max && d.run_minutes_max <= l.max) ?? LENGTHS[1];
      setLength(len.code);
      const care = await supabase.from('dog_care').select('*').eq('dog_id', id).maybeSingle();
      setHealth(care.data?.health_notes ?? ''); setVet(care.data?.vet_name ?? ''); setEmergency(care.data?.emergency_contact ?? '');
    })();
  }, [id, isNew]);

  const save = async () => {
    if (!session) return;
    if (!name.trim()) return Alert.alert('Add a name', 'What should runners call your dog?');
    setBusy(true);
    try {
      const len = LENGTHS.find((l) => l.code === length)!;
      const row = {
        owner_id: session.user.id, name: name.trim(), breed: breed.trim() || null,
        birth_year: /^\d{4}$/.test(born) ? Number(born) : null, size, energy,
        run_minutes_min: len.min, run_minutes_max: len.max, leash_manners: leash,
        reactive_dogs: rDogs, reactive_people: rPeople, reactive_bikes: rBikes, heat_sensitive: heat,
      };
      let savedId = dogId;
      if (!savedId) {
        const { data, error } = await supabase.from('dogs').insert(row).select('id').single();
        if (error) throw error;
        savedId = data.id as string;
        // every dog gets its own listing; owners can combine dogs into one listing later
        const l = await supabase.from('listings').insert({ owner_id: session.user.id, title: row.name, preferred_tier: length }).select('id').single();
        if (l.error) throw l.error;
        const ld = await supabase.from('listing_dogs').insert({ listing_id: l.data.id, dog_id: savedId });
        if (ld.error) throw ld.error;
        setDogId(savedId);
      } else {
        const { error } = await supabase.from('dogs').update(row).eq('id', savedId);
        if (error) throw error;
      }
      const care = await supabase.from('dog_care').upsert({
        dog_id: savedId, health_notes: health.trim() || null, vet_name: vet.trim() || null, emergency_contact: emergency.trim() || null,
      });
      if (care.error) throw care.error;

      if (isNew && !dogId) {
        Alert.alert(`${row.name} is saved`, 'Add a few photos below, then set the times you want runs.');
        return;
      }
      done();
    } catch (e) {
      Alert.alert('Not saved', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    if (next === 'runner') router.replace('/runner-setup');
    else router.back();
  };

  return (
    <Screen>
      <Title>{isNew ? 'Add your dog' : name || 'Your dog'}</Title>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Scout" />
      <Field label="Breed" value={breed} onChangeText={setBreed} placeholder="Australian Shepherd" />
      <Field label="Year born" value={born} onChangeText={setBorn} placeholder="2023" keyboardType="number-pad" maxLength={4} />

      <Label>Size</Label>
      <Chips>{SIZES.map((s) => <Chip key={s} label={SIZE_LABEL[s]} on={size === s} onPress={() => setSize(s)} />)}</Chips>
      <Label>Energy</Label>
      <Chips>{ENERGIES.map((e) => <Chip key={e} label={ENERGY_LABEL[e]} on={energy === e} onPress={() => setEnergy(e)} />)}</Chips>
      <Label>Run length you want</Label>
      <Chips>{LENGTHS.map((l) => <Chip key={l.code} label={l.label} on={length === l.code} onPress={() => setLength(l.code)} />)}</Chips>

      <Label>Manners</Label>
      <StarRow label="Leash manners" value={leash} onChange={setLeash} />
      <ToggleRow title="Reactive to other dogs" value={rDogs} onChange={setRDogs} />
      <ToggleRow title="Reactive to people" value={rPeople} onChange={setRPeople} />
      <ToggleRow title="Reactive to bikes or scooters" value={rBikes} onChange={setRBikes} />
      <ToggleRow title="Sensitive to heat" detail="Flat-faced breeds, thick coats, seniors" value={heat} onChange={setHeat} />

      <Label>Care details (only matched runners see these)</Label>
      <Field label="Health notes" value={health} onChangeText={setHealth} multiline placeholder="Allergies, medications, injuries" />
      <Field label="Vet" value={vet} onChangeText={setVet} placeholder="Dupont Animal Clinic, (202) 555-0100" />
      <Field label="Emergency contact" value={emergency} onChangeText={setEmergency} placeholder="Name and phone" />

      <Button title={dogId ? 'Save changes' : 'Save dog'} onPress={save} loading={busy} />

      {dogId ? (
        <>
          <Label>Photos</Label>
          <PhotoGrid subjectType="dog" subjectId={dogId} />
          <Button title="Set run times" kind="ghost" icon="calendar"
            onPress={() => router.push({ pathname: '/availability', params: { dog: dogId } })} />
          <Notice tone="info">Runners only see your dog if their free times overlap the run times you set.</Notice>
          <Button title="Done" kind="line" onPress={done} />
        </>
      ) : (
        <Body small muted>Save first, then add photos and run times.</Body>
      )}
    </Screen>
  );
}
