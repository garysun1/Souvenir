import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, DemoLabel, Header, Screen, SectionHeading, T } from '@/components/ui';
import { colors } from '@/design/tokens';

export default function AboutScreen() {
  return <Screen>
    <Header title="About Souvenir" back />
    <T variant="wordmark" color={colors.brand}>souvenir</T>
    <T style={{ marginTop: 10 }}>Keep the places that stay with you.</T>
    <View style={{ marginTop: 18 }}><DemoLabel label="An interactive, locally saved prototype" /></View>
    <SectionHeading title="What works on your device" />
    <T>Explore the bundled Los Angeles catalog, save places, collect visits, write moments, rank favorites and make sample plans. Your edits are persisted on this installation, with no sign-in.</T>
    <T muted style={{ marginTop: 12 }}>Camera, photo-library selection and foreground location can use device features where supported and permitted. Sample-photo alternatives are available. A selected photo is not analyzed by an AI.</T>
    <SectionHeading title="What is simulated" />
    <T>Identification, discovery counts, friends, shared lists, recommendations, itinerary planning, Dropbox import and provider feeds are local demonstrations. They do not contact an AI service, upload an album, collaborate across devices or connect an external account.</T>
    <T muted style={{ marginTop: 12 }}>There is no live availability, ticket inventory, booking, payment or weather verification. Extension previews are concepts, not services. Offline mode is a demonstration, not a device network setting.</T>
    <SectionHeading title="Catalog documentation" />
    <T>Real destination names and approximate coordinates are bundled with authored descriptions and categories. Operational values—hours, duration, visit cost, booking notes and discovery counts—are sample fixtures, not retrieved venue records.</T>
    <T muted style={{ marginTop: 12 }}>The sample baseline is September 19, 2026. A fixture date is not an observation or retrieval date. No provider snapshot is labeled verified without a source record and recorded provenance.</T>
    <T variant="small" muted selectable style={{ marginTop: 12 }}>Catalog: src/fixtures/catalog.ts{ '\n' }Weather scenario: src/fixtures/weather.ts{ '\n' }Source registry: src/fixtures/sources.ts</T>
    <SectionHeading title="Reading a source fact" />
    <View style={{ gap: 12 }}>
      <T><T variant="label">Known sample: </T>a value authored for the prototype, not a live claim.</T>
      <T><T variant="label">Unknown: </T>no supported value is available. It is not a zero.</T>
      <T><T variant="label">Not applicable: </T>the measurement does not describe this place. NPS visitation does not apply to any bundled destination.</T>
      <T><T variant="label">Stale / unavailable: </T>operational facts are not checked; your catalog entries and memories remain intact.</T>
    </View>
    <SectionHeading title="Your local data" />
    <T muted>There is no cloud backup or cross-device sync. Resetting the demo replaces local prototype records and references to selected photos, not the originals in your device library. Documentation links leave Souvenir and may require a connection.</T>
    <View style={{ marginTop: 24, gap: 12 }}>
      <Button label="Explore data sources" variant="outline" icon="globe" onPress={() => router.push('/settings/sources')} />
      <Button label="Photography & font credits" variant="outline" icon="image" onPress={() => router.push('/settings/credits')} />
    </View>
  </Screen>;
}
