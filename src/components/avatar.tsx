import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { photoUrl } from '@/lib/supabase';
import { usePalette } from '@/lib/theme';

export function Avatar({ path, name, size = 48 }: { path: string | null | undefined; name: string; size?: number }) {
  const c = usePalette();
  const uri = photoUrl(path);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, overflow: 'hidden', backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        : <Text style={{ color: '#fff', fontWeight: '900', fontStyle: 'italic', fontSize: size * 0.38 }}>{name.slice(0, 2).toUpperCase()}</Text>}
    </View>
  );
}
