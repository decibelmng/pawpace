import { StripeProvider } from '@stripe/stripe-react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { session, profile, loading } = useSession();
  useEffect(() => { if (!loading) SplashScreen.hideAsync(); }, [loading]);
  if (loading) return null;

  const signedIn = !!session;
  const ready = signedIn && !!profile?.onboarded;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !ready}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[matchId]" />
        <Stack.Screen name="run/[id]" />
        <Stack.Screen name="live/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="dog/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="runner-setup" options={{ presentation: 'modal' }} />
        <Stack.Screen name="availability" options={{ presentation: 'modal' }} />
        <Stack.Screen name="lock-in/[matchId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cancel/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="report/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="rate/[id]" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider
        publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
        urlScheme="pawpace"
        merchantIdentifier="merchant.com.pawpace.app">
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <SessionProvider>
            <Routes />
          </SessionProvider>
        </ThemeProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
