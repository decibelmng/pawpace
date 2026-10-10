import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, Field, Label } from '@/components/ui';
import { errorText, supabase } from '@/lib/supabase';
import { space, type, usePalette } from '@/lib/theme';

// Expo Go doesn't include the native Apple button; it appears in the real iPhone build.
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function SignIn() {
  const c = usePalette();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [useCode, setUseCode] = useState(false);
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

  const validEmail = () => /^\S+@\S+\.\S+$/.test(email.trim());

  const passwordSignIn = async () => {
    if (!validEmail()) return Alert.alert('Check your email', 'Enter a full email address.');
    if (password.length < 6) return Alert.alert('Password too short', 'Use at least 6 characters.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) Alert.alert('Could not sign in', 'Check your email and password, or tap Create account if you are new.');
  };

  const createAccount = async () => {
    if (!validEmail()) return Alert.alert('Check your email', 'Enter a full email address.');
    if (password.length < 6) return Alert.alert('Password too short', 'Use at least 6 characters.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) return Alert.alert('Account not created', errorText(error));
    if (!data.session) {
      Alert.alert('Almost there', 'This email may already have an account, or email confirmation is still on. Try Sign in, or use a different email.');
    }
  };

  const sendCode = async () => {
    if (!validEmail()) return Alert.alert('Check your email', 'Enter a full email address.');
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: space.xl, justifyContent: 'space-between', gap: space.xl }}>
        <View style={{ gap: space.md, marginTop: space.xxl }}>
          <Text numberOfLines={1} adjustsFontSizeToFit
            style={{ fontSize: 52, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, paddingRight: 8, color: c.ink }}>
            PAW<Text style={{ color: c.accent }}>PACE</Text>
          </Text>
          <Text style={[type.title, { color: c.ink }]}>Running buddies for your dog.</Text>
          <Body muted>Match with local runners who get paid to take your dog on real runs, or earn on the runs you already do.</Body>
        </View>

        <View style={{ gap: space.md }}>
          {Platform.OS === 'ios' && !inExpoGo ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={c.bg === '#FFFFFF' ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={14}
              style={{ height: 52 }}
              onPress={apple}
            />
          ) : null}
          <Label>{inExpoGo ? 'Sign in' : 'Or use your email'}</Label>
          {!useCode ? (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                autoComplete="email" placeholder="you@example.com" />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
                autoComplete="password" placeholder="At least 6 characters" />
              <Button title="Sign in" onPress={passwordSignIn} loading={busy} kind="dark" />
              <Button title="Create account" kind="line" onPress={createAccount} />
              <Button title="Email me a code instead" kind="line" onPress={() => setUseCode(true)} />
            </>
          ) : !sent ? (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                autoComplete="email" placeholder="you@example.com" />
              <Button title="Email me a code" onPress={sendCode} loading={busy} kind="dark" />
              <Button title="Use a password instead" kind="line" onPress={() => setUseCode(false)} />
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
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
