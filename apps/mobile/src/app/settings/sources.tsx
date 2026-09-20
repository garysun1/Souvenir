import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, DemoLabel, Divider, EmptyState, Field, Header, Icon, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { colors } from '@/design/tokens';
import { factsForPlace, formatDemoClock, resolveSourceQuery, sourceStatusLabel } from '@/domain/sources';
import { places } from '@/fixtures/catalog';
import { sources, type SourceDefinition } from '@/fixtures/sources';
import { DetailLine, SourceLink } from '@/features/sources/components';
import { FactDetails, SourceFacts } from '@/features/sources/SourceFacts';
import { useApp } from '@/state/AppProvider';

export default function SourcesScreen() {
  const params = useLocalSearchParams<{ placeId?: string | string[]; sourceId?: string | string[] }>();
  const { state } = useApp();
  const [selectedSource, setSelectedSource] = useState<SourceDefinition | null>(null);
  const [dismissedSource, setDismissedSource] = useState<string | null>(null);
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [query, setQuery] = useState('');
  const resolved = resolveSourceQuery(params);
  if (resolved.status === 'unavailable') return <Screen><Header title="Data sources" back /><EmptyState title="Source view unavailable" message={resolved.reason} action="View all sources" onPress={() => router.replace('/settings/sources')} icon="info" /></Screen>;
  const { place, source: linkedSource } = resolved;
  const activeSource = selectedSource ?? (linkedSource?.id !== dismissedSource ? linkedSource : undefined);
  const sourceFacts = place && activeSource ? factsForPlace(place, { sourceStatus: state.preferences.sourceStatus, clock: state.clock }).filter(fact => fact.sourceId === activeSource.id) : [];
  const matches = places.filter(item => `${item.name} ${item.neighborhood}`.toLowerCase().includes(query.trim().toLowerCase()));
  const closeSource = () => { setSelectedSource(null); setDismissedSource(linkedSource?.id ?? null); };
  return <Screen>
    <Header title="Data sources" back subtitle={place ? place.name : 'A little context behind every fact.'} />
    <DemoLabel label="Bundled data · no live provider connection" />
    <View style={styles.note}>
      <T variant="label">Real places. Sample operations.</T>
      <T muted>Destination names and provider documentation refer to real places and services. Hours, costs, access and planning weather are local samples, not verified snapshots.</T>
      <T variant="small" muted>No NPS visitor totals apply to this catalog. Missing information is never shown as zero.</T>
    </View>
    {state.preferences.offline && <T style={styles.notice}>Offline demonstration is on. Bundled facts remain available. Documentation links open an external browser and may need a connection.</T>}
    {state.preferences.sourceStatus !== 'sample' && <View style={styles.note}>
      <T variant="label">{state.preferences.sourceStatus === 'stale' ? 'Simulating stale sources' : 'Simulating unavailable sources'}</T>
      <T muted>Operational facts are not checked. Catalog identity and your personal memories are preserved.</T>
      <Button label="Change source simulation" variant="outline" onPress={() => router.push('/settings/demo')} />
    </View>}
    <SectionHeading title="Source directory" />
    {sources.map(source => <Pressable key={source.id} accessibilityRole="button" onPress={() => setSelectedSource(source)} style={({ pressed }) => [styles.sourceRow, pressed && { backgroundColor: colors.surface }]}>
      <Icon name={source.id === 'open-meteo' ? 'cloud' : source.id === 'la-parks' || source.id === 'nps' ? 'leaf' : 'globe'} />
      <View style={styles.grow}><T variant="place">{source.name}</T><T variant="small" color={colors.brand}>{sourceStatusLabel(source, state.preferences.sourceStatus)}</T><T variant="small" muted>{source.id === 'curated' || source.id === 'open-meteo' ? source.period : 'No retrieved destination snapshot'}</T></View><Icon name="chevron" size={18} />
    </Pressable>)}
    <SectionHeading title="Facts by destination" />
    <Button label={place ? 'Choose another destination' : 'Choose a destination'} variant="outline" icon="search" onPress={() => { setQuery(''); setChoosingPlace(true); }} />
    {place ? <>
      <PlaceRow place={place} subtitle="Open shared destination page" />
      <T variant="small" muted>Selected demo time: {formatDemoClock(state.clock)}</T>
      <SourceFacts place={place} />
      <Button label="Clear destination filter" variant="ghost" onPress={() => router.replace('/settings/sources')} />
    </> : <T muted style={{ marginTop: 16 }}>Choose a destination to inspect each fact’s record, geographic scope, units and dates. Empty albums still include the full catalog.</T>}
    <SectionHeading title="Know before you go" />
    <T muted>Provider documentation is a reference, not an active connection. Check the venue and a current forecast before a real visit. Souvenir never verifies availability or makes bookings.</T>
    <Sheet visible={!!activeSource} onClose={closeSource} title={activeSource?.name ?? 'Source details'}>
      {activeSource && <>
        <DemoLabel label={sourceStatusLabel(activeSource, state.preferences.sourceStatus)} />
        <T>{activeSource.description}</T>
        <DetailLine label="Provider" value={activeSource.provider} />
        <DetailLine label="Geographic scope" value={activeSource.scope} />
        <DetailLine label="Data period / as-of" value={activeSource.period} />
        <DetailLine label="Units" value={activeSource.units} />
        <DetailLine label="Retrieval date" value="No destination records retrieved. Reading provider documentation does not verify the demo data." />
        <DetailLine label="Important boundary" value={activeSource.boundary} />
        {activeSource.bundledFile && <DetailLine label="Local sample definition" value={activeSource.bundledFile} />}
        {activeSource.documentationUrl ? <SourceLink url={activeSource.documentationUrl} /> : <Button label="Read catalog documentation" variant="outline" onPress={() => { closeSource(); router.push('/settings/about'); }} />}
        {sourceFacts.map(fact => <View key={fact.id}><Divider /><T variant="heading" style={{ marginBottom: 12 }}>{fact.label}</T><FactDetails fact={fact} showDocumentation={false} /></View>)}
        {!place && <T variant="small" muted>Select a destination on the source page to inspect its local record IDs and individual fact provenance.</T>}
      </>}
    </Sheet>
    <Sheet visible={choosingPlace} onClose={() => setChoosingPlace(false)} title="Choose a destination">
      <Field label="Search bundled places" value={query} onChangeText={setQuery} placeholder="Name or neighborhood" autoCorrect={false} />
      <T variant="small" muted>{matches.length} {matches.length === 1 ? 'destination' : 'destinations'} in the sample catalog</T>
      {matches.map(item => <PlaceRow key={item.id} place={item} onPress={() => { setChoosingPlace(false); router.setParams({ placeId: item.id }); }} />)}
      {!matches.length && <EmptyState title="No matching places" message="Try a different name or neighborhood. This prototype only includes its bundled LA catalog." action="Clear search" onPress={() => setQuery('')} icon="search" />}
    </Sheet>
  </Screen>;
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 4 }, note: { padding: 17, borderRadius: 12, backgroundColor: colors.surface, gap: 10, marginTop: 18 },
  notice: { color: colors.muted, marginTop: 16 },
  sourceRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 19, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
