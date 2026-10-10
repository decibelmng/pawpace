import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, Field, Label } from '@/components/ui';
import { errorText, supabase } from '@/lib/supabase';
import { space, type, usePalette } from '@/lib/theme';

export default function SignIn() {
  const c = usePalette();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const apple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) throw new Error('Apple did not return a sign-in token. Try again.');
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
      if (error) throw error;
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
      if (name) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').update({ display_name: name }).eq('id', user.id);
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Sign in with Apple failed', errorText(e));
    }
  };

  const sendCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('Check your email', 'Enter a full email address.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return Alert.alert('Code not sent', errorText(error));
    setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) Alert.alert('That code did not work', 'Check the 6-digit code in your email, or send a new one.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, padding: space.xl, justifyContent: 'space-between' }}>
        <View style={{ gap: space.md, marginTop: space.xxl }}>
          <Text style={{ fontSize: 56, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, color: c.ink }}>
            PAW<Text style={{ color: c.accent }}>PACE</Text>
          </Text>
          <Text style={[type.title, { color: c.ink }]}>Running buddies for your dog.</Text>
          <Body muted>Match with local runners who get paid to take your dog on real runs, or earn on the runs you already do.</Body>
        </View>

        <View style={{ gap: space.md }}>
          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={c.bg === '#FFFFFF' ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={14}
              style={{ height: 52 }}
              onPress={apple}
            />
          ) : null}
          <Label>Or use your email</Label>
          {!sent ? (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                autoComplete="email" placeholder="you@example.com" />
              <Button title="Email me a code" onPress={sendCode} loading={busy} kind="dark" />
            </>
          ) : (
            <>
              <Field label={`6-digit code sent to ${email}`} value={code} onChangeText={setCode} keyboardType="number-pad"
                autoComplete="one-time-code" maxLength={6} placeholder="123456" />
              <Button title="Sign in" onPress={verify} loading={busy} />
              <Button title="Use a different email" kind="line" onPress={() => { setSent(false); setCode(''); }} />
            </>
          )}
          <Body small muted>By continuing you agree to the PawPace Terms and Privacy Policy.</Body>
        </View>
      </View>
    </SafeAreaView>
  );
}
