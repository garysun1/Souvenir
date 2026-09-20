import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { useState } from 'react';
import { Button, DemoLabel, Field, Icon, Screen, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { useApp } from '@/state/AppProvider';
import { colors } from '@/design/tokens';
export default function Welcome() {
  const { startDemo, signIn, signUp, signOut, mode } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async (demo: 'sample' | 'empty') => { await startDemo(demo); };
  const authenticate = async (signup: boolean) => {
    setBusy(true); setMessage('');
    try {
      if (signup) {
        const signedIn = await signUp(email, password);
        if (!signedIn) setMessage('Check your email to confirm your account, then return here and sign in. If you already have an account, sign in with your existing password.');
      } else await signIn(email, password);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Authentication failed. Please retry.'); }
    finally { setBusy(false); }
  };
  return <Screen padded={false}><View style={{ paddingHorizontal: 26, paddingTop: 18, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T variant="wordmark" color={colors.brand}>souvenir</T><DemoLabel label="Los Angeles edition" /></View>
    <PlacePhoto placeId="la-echo-park" style={{ height: 330, borderRadius: 0 }}>
      <LinearGradient colors={['transparent', '#082C3899']} style={{ flex: 1, padding: 26, justifyContent: 'flex-end' }}><View style={{ flexDirection: 'row', gap: 6 }}><Icon name="pin" size={16} color="#fff" /><T variant="small" color="#fff">Echo Park Lake · Los Angeles</T></View></LinearGradient>
    </PlacePhoto>
    <View style={{ padding: 26, gap: 18 }}><T variant="title" style={{ fontSize: 36, lineHeight: 44 }}>A place becomes{'\n'}a part of you.</T><T muted>Find your next favorite corner. Make a little memory. Keep a souvenir.</T>
      <View style={{ flexDirection: 'row', gap: 22, marginVertical: 5 }}>{(['Discover', 'Experience', 'Collect'] as const).map((label, index) => <View key={label} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><T variant="small" color={colors.brand}>0{index + 1}</T><T variant="small">{label}</T></View>)}</View>
      {mode !== 'demo' ? <>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
        {!!message && <T accessibilityRole="alert">{message}</T>}
        <Button label="Sign in" disabled={busy || !email.trim() || !password} onPress={() => authenticate(false)} />
        <Button label="Create an account" variant="outline" disabled={busy || !email.trim() || !password} onPress={() => authenticate(true)} />
        <T variant="small" muted>Use the same email as the web app. Account visits, private photos and saved places sync through Souvenir. Drafts stay on this device until saved.</T>
        <Button label="Retry sign out" variant="ghost" onPress={signOut} />
      </> : <Button label="Continue demo" onPress={() => router.replace('/onboarding/tastes')} />}
      <Button label="Explore the sample collection" disabled={busy} onPress={() => start('sample')} icon="arrow" variant="outline" />
      <Button label="Start an empty local demo" disabled={busy} onPress={() => start('empty')} variant="ghost" />
      <T variant="small" muted style={{ textAlign: 'center' }}>Demo mode stays on this device and never syncs into an account.</T>
    </View></Screen>;
}
