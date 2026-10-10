import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, Chip, Row } from '@/components/ui';
import { pace } from '@/lib/format';
import { useSession } from '@/lib/session';
import { errorText, supabase } from '@/lib/supabase';
import { space, type, usePalette } from '@/lib/theme';
import type { Run } from '@/lib/types';

interface Pt { latitude: number; longitude: number; t: number }

const miles = (a: Pt, b: Pt) => {
  const R = 3958.8, toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.latitude - a.latitude), dLng = toR(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.latitude)) * Math.cos(toR(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const total = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + miles(pts[i - 1], p) : 0), 0);

/** Runner: records the route and streams it. Owner: watches it live (GPS add-on runs). */
export default function LiveRun() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const c = usePalette();
  const [run, setRun] = useState<Run | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);
  const map = useRef<MapView>(null);
  const isRunner = run?.runner_id === session?.user.id;

  useEffect(() => {
    supabase.from('runs').select('*').eq('id', id).single().then(({ data }) => setRun(data as Run));
    supabase.from('run_points').select('lat, lng, recorded_at').eq('run_id', id).order('recorded_at')
      .then(({ data }) => setPts((data ?? []).map((p) => ({ latitude: p.lat, longitude: p.lng, t: Date.parse(p.recorded_at) }))));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [id]);

  // runner: record points every ~10 meters and upload them
  useEffect(() => {
    if (!run || !isRunner || run.status !== 'in_progress' || run.ended_at) return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return Alert.alert('Location is off', 'Turn on location so the owner can follow the run and the distance is recorded.');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 10 },
        (loc) => {
          const p = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, t: loc.timestamp };
          setPts((prev) => [...prev, p]);
          supabase.from('run_points').insert({ run_id: id, lat: p.latitude, lng: p.longitude }).then(() => {});
        },
      );
    })();
    return () => { sub?.remove(); };
  }, [run, isRunner, id]);

  // owner: follow the live route
  useEffect(() => {
    if (!run || isRunner) return;
    const ch = supabase.channel(`live-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'run_points', filter: `run_id=eq.${id}` },
        (p) => setPts((prev) => [...prev, { latitude: p.new.lat, longitude: p.new.lng, t: Date.parse(p.new.recorded_at) }]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [run, isRunner, id]);

  useEffect(() => {
    const last = pts[pts.length - 1];
    if (last) map.current?.animateCamera({ center: last, zoom: 15 }, { duration: 400 });
  }, [pts]);

  if (!run) return null;
  const started = run.started_at ? Date.parse(run.started_at) : now;
  const secs = Math.max(0, Math.floor(((run.ended_at ? Date.parse(run.ended_at) : now) - started) / 1000));
  const mi = total(pts);
  const ownerCanWatch = run.gps_addon || isRunner;

  const finish = () => Alert.alert('Finish the run?', 'Do this once the dog is back with the owner.', [
    { text: 'Keep running', style: 'cancel' },
    { text: 'Finish', onPress: async () => {
      setFinishing(true);
      const { error } = await supabase.rpc('finish_run', { p_run: id, p_distance_mi: Math.round(mi * 100) / 100 });
      setFinishing(false);
      if (error) return Alert.alert('Not finished', errorText(error));
      router.replace({ pathname: '/report/[id]', params: { id } });
    } },
  ]);

  const safety = () => Alert.alert('Safety alert', 'Your location is shared with the owner in the chat. Call 911 if anyone is in danger.', [
    { text: 'Call 911', style: 'destructive', onPress: () => Linking.openURL('tel:911') },
    { text: 'Message the owner', onPress: async () => {
      const last = pts[pts.length - 1];
      await supabase.from('messages').insert({
        match_id: run.match_id, sender_id: session!.user.id,
        body: `Safety alert from the run.${last ? ` Location: https://maps.apple.com/?ll=${last.latitude},${last.longitude}` : ''}`,
      });
      Alert.alert('Owner notified');
    } },
    { text: 'Close', style: 'cancel' },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {ownerCanWatch ? (
        <MapView ref={map} style={{ flex: 1 }} showsUserLocation={isRunner}
          initialRegion={pts[0] ? { ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 } : { latitude: 38.9072, longitude: -77.0369, latitudeDelta: 0.05, longitudeDelta: 0.05 }}>
          {pts.length > 1 ? <Polyline coordinates={pts} strokeColor={c.accent} strokeWidth={5} /> : null}
          {pts.length ? <Marker coordinate={pts[pts.length - 1]} pinColor={c.accent} /> : null}
        </MapView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: c.surface }}>
          <Body muted>Live map is part of the GPS add-on. You'll see the full route in the run report.</Body>
        </View>
      )}
      <SafeAreaView edges={['bottom']} style={{ padding: space.lg, gap: space.md, borderTopWidth: 1, borderColor: c.line }}>
        <Row><Chip label={run.ended_at ? 'Run finished' : 'Live'} tone={run.ended_at ? 'good' : 'crit'} /><Chip label="Leashed run" /></Row>
        <Row between>
          {[[`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 'TIME'], [mi.toFixed(2), 'MILES'], [mi > 0.05 ? pace(secs / mi) : '--:--', 'PACE / MI']].map(([v, l]) => (
            <View key={l} style={{ flex: 1 }}>
              <Text style={[type.stat, { fontSize: 38, color: c.ink }]}>{v}</Text>
              <Text style={[type.label, { color: c.muted }]}>{l}</Text>
            </View>
          ))}
        </Row>
        {isRunner && !run.ended_at ? (
          <Row>
            <View style={{ flex: 1 }}><Button title="Safety" kind="line" onPress={safety} /></View>
            <View style={{ flex: 2 }}><Button title="Finish run" onPress={finish} loading={finishing} /></View>
          </Row>
        ) : <Button title="Close" kind="line" onPress={() => router.back()} />}
        {isRunner && !run.ended_at ? <Body small muted>Keep PawPace open during the run so the route records.</Body> : null}
      </SafeAreaView>
    </View>
  );
}
