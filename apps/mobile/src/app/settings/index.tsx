import { router } from 'expo-router';
import { View } from 'react-native';
import { DemoLabel, Header, Screen, SectionHeading, T } from '@/components/ui';
import { categoryLabels } from '@/fixtures/catalog';
import { SettingsRow } from '@/features/sources/components';
import { useApp } from '@/state/AppProvider';

export default function SettingsScreen() {
  const { state } = useApp();
  const tastes = state.preferences.tastes.map(taste => categoryLabels[taste]).join(' · ') || 'Surprise me';
  return <Screen>
    <Header title="Settings" back subtitle="Make Souvenir feel like you." />
    <DemoLabel label="Local prototype · no accounts or live feeds" />
    <SectionHeading title="Preferences" />
    <SettingsRow title="Taste preferences" subtitle={tastes} icon="heart" onPress={() => router.push('/onboarding/tastes')} />
    <SectionHeading title="Data & demo" />
    <SettingsRow title="Data sources" subtitle="What we know, what is sample, and what is missing" icon="globe" onPress={() => router.push('/settings/sources')} />
    <SettingsRow title="Demo controls" subtitle="Reset, advance the clock, or try a failure state" icon="settings" onPress={() => router.push('/settings/demo')} />
    <SectionHeading title="About" />
    <SettingsRow title="About Souvenir" subtitle="A local collection of places and moments" icon="info" onPress={() => router.push('/settings/about')} />
    <SettingsRow title="Photography & font credits" subtitle="The people and licenses behind this prototype" icon="image" onPress={() => router.push('/settings/credits')} />
    <View style={{ marginTop: 30, gap: 8 }}><T variant="wordmark">souvenir</T><T variant="small" muted>Your memories stay on this installation. Identification, planning, imports and source services are demonstrations, not connected accounts.</T></View>
  </Screen>;
}
