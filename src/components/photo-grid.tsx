import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { addPhotos, removePhoto } from '@/lib/photos';
import { errorText, photoUrl, supabase } from '@/lib/supabase';
import { radius, type, usePalette } from '@/lib/theme';

import { Body } from './ui';

interface PhotoRow { id: string; path: string; sort: number }

/** Up to 6 photos for a profile or a dog. The first one is the main photo on cards. */
export function PhotoGrid({ subjectType, subjectId, onChange }: {
  subjectType: 'profile' | 'dog'; subjectId: string; onChange?: () => void;
}) {
  const c = usePalette();
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('photos').select('id, path, sort')
      .eq('subject_type', subjectType).eq('subject_id', subjectId).order('sort');
    setPhotos((data as PhotoRow[]) ?? []);
  }, [subjectType, subjectId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      const n = await addPhotos(subjectType, subjectId, photos.length);
      if (n) { await load(); onChange?.(); }
    } catch (e) {
      Alert.alert('Photo not added', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (p: PhotoRow) => {
    Alert.alert('Remove this photo?', undefined, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await removePhoto(p.id, p.path); await load(); onChange?.(); } catch (e) { Alert.alert('Not removed', errorText(e)); }
      } },
    ]);
  };

  const tile = { width: '31.5%' as const, aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' as const };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((p, i) => (
          <Pressable key={p.id} onLongPress={() => remove(p)} accessibilityLabel={`Photo ${i + 1}. Hold to remove.`} style={tile}>
            <Image source={{ uri: photoUrl(p.path) ?? undefined }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            {i === 0 ? (
              <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(11,13,18,.7)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={[type.label, { color: '#fff', fontSize: 10 }]}>Main</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
        {photos.length < 6 ? (
          <Pressable accessibilityRole="button" onPress={add} disabled={busy}
            style={[tile, { borderWidth: 2, borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: c.accent, fontSize: 30, fontWeight: '800' }}>{busy ? '…' : '+'}</Text>
            <Text style={[type.small, { color: c.accent, fontWeight: '700' }]}>Add photo</Text>
          </Pressable>
        ) : null}
      </View>
      <Body small muted>Up to 6. The first is your main photo. Hold a photo to remove it.</Body>
    </View>
  );
}
