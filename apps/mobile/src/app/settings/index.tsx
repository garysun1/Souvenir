import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, DemoLabel, Header, Screen, SectionHeading, T } from '@/components/ui';
import { categoryLabels } from '@/fixtures/catalog';
import { SettingsRow } from '@/features/sources/components';
import { useApp } from '@/state/AppProvider';

export default function SettingsScreen() {
  const { state, mode, signOut, refresh } = useApp();
  const tastes = state.preferences.tastes.map(taste => categoryLabels[taste]).join(' · ') || 'Surprise me';
  return <Screen>
    <Header title="Settings" back subtitle="Make Souvenir feel like you." />
    <DemoLabel label={mode === 'account' ? 'Account connected · provider feeds unavailable' : 'Local demo · no cloud sync'} />
    {mode === 'account' && <Button label="Refresh account" variant="outline" onPress={refresh} />}
    <Button label={mode === 'account' ? 'Sign out' : 'Leave demo / sign in'} variant="outline" onPress={signOut} />
    <SectionHeading title="Preferences" />
    <SettingsRow title="Taste preferences" subtitle={tastes} icon="heart" onPress={() => router.push('/onboarding/tastes')} />
    <SectionHeading title="Data & demo" />
    <SettingsRow title="Data sources" subtitle="What we know, what is sample, and what is missing" icon="globe" onPress={() => router.push('/settings/sources')} />
    {mode === 'demo' && <SettingsRow title="Demo controls" subtitle="Reset, advance the clock, or try a failure state" icon="settings" onPress={() => router.push('/settings/demo')} />}
    <SectionHeading title="About" />
    <SettingsRow title="About Souvenir" subtitle="A local collection of places and moments" icon="info" onPress={() => router.push('/settings/about')} />
    <SettingsRow title="Photography & font credits" subtitle="The people and licenses behind this prototype" icon="image" onPress={() => router.push('/settings/credits')} />
    <View style={{ marginTop: 30, gap: 8 }}><T variant="wordmark">souvenir</T><T variant="small" muted>{mode === 'account' ? 'Saved visits and private photos sync to your account. Unsaved capture drafts, tastes and layout preferences stay on this device. Provider simulations remain separate.' : 'Demo memories stay on this installation. Sign in separately for cloud sync.'}</T></View>
  </Screen>;
}
