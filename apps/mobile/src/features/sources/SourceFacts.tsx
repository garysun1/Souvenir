import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DemoLabel, EmptyState, Icon, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { evidenceLabel, factsForPlace, factValue, type SourceFact } from '@/domain/sources';
import type { Place } from '@/domain/types';
import { sourceById, type SourceId } from '@/fixtures/sources';
import { useApp } from '@/state/AppProvider';
import { CatalogDocumentationLink, DetailLine, SourceLink } from './components';

export function FactDetails({ fact, showDocumentation = true, onBeforeNavigate }: { fact: SourceFact; showDocumentation?: boolean; onBeforeNavigate?: () => void }) {
  const source = sourceById(fact.sourceId);
  const evidence = fact.evidence;
  return <View style={styles.details}>
    <DemoLabel label={evidenceLabel(fact)} />
    <T variant="heading">{factValue(fact)}</T>
    {evidence.status !== 'known' && <T>{evidence.reason}</T>}
    {fact.previousSample !== undefined && <T color={colors.error}>Previous sample only: {fact.previousSample}. Do not use this as current availability.</T>}
    <DetailLine label="What this fact describes" value={fact.provenance.explanation} />
    <DetailLine label="Provider / reference" value={source?.provider ?? 'Source record unavailable'} />
    <DetailLine label="Local provenance record" value={fact.provenance.recordId} />
    <DetailLine label="Provider record ID" value={fact.provenance.providerRecordId ?? 'None retrieved — local ID above is not a provider ID'} />
    <DetailLine label="Geographic scope" value={fact.provenance.geographicScope} />
    <DetailLine label="Data period" value={fact.provenance.period} />
    <DetailLine label="Unit" value={fact.provenance.unit} />
    <DetailLine label="Observation / fixture date" value={fact.provenance.observedAt ? `${fact.provenance.observedAt} · sample fixture date, not a real observation` : 'No observation recorded'} />
    <DetailLine label="Retrieval date" value={fact.provenance.retrievedAt ?? 'Not retrieved — no provider snapshot'} />
    {source?.bundledFile && <DetailLine label="Bundled definition" value={source.bundledFile} />}
    {showDocumentation && source && (source.documentationUrl ? <SourceLink url={source.documentationUrl} /> : <CatalogDocumentationLink onBeforeNavigate={onBeforeNavigate} />)}
  </View>;
}

/** Optional detail-page integration: uses shared sourceStatus and clock by default. */
export function SourceFacts({ place, sourceId, clock, rain }: { place: Place; sourceId?: SourceId; clock?: string; rain?: boolean }) {
  const { state } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const facts = factsForPlace(place, { sourceStatus: state.preferences.sourceStatus, clock: clock ?? state.clock, rain }).filter(fact => !sourceId || fact.sourceId === sourceId);
  const selected = facts.find(fact => fact.id === selectedId);
  if (!facts.length) return <EmptyState title="No source facts" message="No facts are bundled for this selection. The destination and your memories are unchanged." icon="info" />;
  return <>
    <T variant="small" muted>Tap a fact for its scope, unit, dates and provenance. Sample values are not live venue information.</T>
    {facts.map(fact => <Pressable key={fact.id} accessibilityRole="button" accessibilityLabel={`${fact.label}: ${factValue(fact)}. ${evidenceLabel(fact)}. View provenance`} onPress={() => setSelectedId(fact.id)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
      <View style={styles.grow}><T variant="label">{fact.label}</T><T>{factValue(fact)}</T><T variant="small" muted>{sourceById(fact.sourceId)?.name} · {evidenceLabel(fact)}</T></View><Icon name="info" size={19} />
    </Pressable>)}
    <Sheet visible={!!selected} onClose={() => setSelectedId(null)} title={selected?.label ?? 'Fact provenance'}>
      {selected && <FactDetails fact={selected} onBeforeNavigate={() => setSelectedId(null)} />}
    </Sheet>
  </>;
}

const styles = StyleSheet.create({
  details: { gap: 16 }, grow: { flex: 1, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, minHeight: 80, borderBottomWidth: 1, borderBottomColor: colors.divider },
});
