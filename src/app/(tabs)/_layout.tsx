import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { usePalette } from '@/lib/theme';

const icon = (name: string) => function TabIcon({ color }: { color: import('react-native').ColorValue }) {
  return <SymbolView name={name as never} tintColor={color as string} size={24} />;
};

export default function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.accent,
      tabBarInactiveTintColor: c.muted,
      tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: icon('rectangle.stack') }} />
      <Tabs.Screen name="connections" options={{ title: 'Connections', tabBarIcon: icon('person.2') }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: icon('bubble.left.and.bubble.right') }} />
      <Tabs.Screen name="runs" options={{ title: 'Runs', tabBarIcon: icon('figure.run') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person.crop.circle') }} />
    </Tabs>
  );
}
