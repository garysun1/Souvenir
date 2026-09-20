import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type {
  ImportBatchDto, MemoryMomentDto, TasteAnalyzeRequest, TasteFacet, TasteIntent, TasteOverride,
  TastePreferences, TasteProfileDto, TasteProfilePatch, TastePublishRequest, TasteSourceRef,
} from '../../../../../shared/memories-contract';
import { Button, Chip, Field, SectionHeading, T } from '@/components/ui';
import { interestLabel, sameSource, sourceKey, tasteInterests, toggleId } from '@/domain/memories';
import { placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { useMemoryActions, useMemoryDraft, useMemoryPage, useMemoryResource } from '@/lib/useMemories';
import { ResourceStatus } from '@/features/discovery/AccountPlaceDetail';
import { ActionStatus, Card, Choices, MemoryPhoto, PageButtons } from './MemoryUi';

export function TasteProfile() {
  const profile = useMemoryResource<TasteProfileDto>('/api/taste');
  return <><ResourceStatus {...profile} />{profile.data && !profile.error && <TasteEditor key={`${profile.data.userId}:${profile.data.version}:${profile.data.updatedAt}`} profile={profile.data} reload={profile.reload} />}</>;
}
interface TasteEdits {
  title: string;
  overrides: TasteOverride[];
  preferences: TastePreferences;
  excludedSources: TasteSourceRef[];
  collage: string[];
}
function TasteEditor({ profile, reload }: { profile: TasteProfileDto; reload: () => void }) {
  const action = useMemoryActions('taste', reload);
  const draft = useMemoryDraft<TasteEdits>(`taste:${profile.version}:${profile.updatedAt}`, {
    title: profile.titleOverride ?? '', overrides: profile.overrides, preferences: profile.preferences,
    excludedSources: profile.excludedSources, collage: profile.collageMomentIds,
  });
  const edits = draft.value;
  const [intent, setIntent] = useState<TasteIntent>('enjoyed');
  const [strength, setStrength] = useState<1 | 2 | 3>(2);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const locked = action.locked || !draft.ready;
  const setOverride = (next: TasteOverride) => {
    const overrides = [...edits.overrides.filter(item => item.interest !== next.interest || item.intent !== next.intent), next];
    if (overrides.length > 20) return;
    draft.save({ ...edits, overrides });
  };
  const save = async () => {
    const input: TasteProfilePatch = {
      expectedVersion: profile.version, titleOverride: edits.title.trim() || null, overrides: edits.overrides,
      preferences: edits.preferences, excludedSources: edits.excludedSources, collageMomentIds: edits.collage,
    };
    await action.run({ label: 'save taste edits', path: '/api/taste', method: 'PATCH', input });
  };
  return <View style={{ gap: 12 }}>
    <T muted>Private suggestions from sources you choose. You decide which interests and photos friends can see.</T>
    <Card><T variant="heading">{profile.draft?.title || 'Still learning your taste'}</T>
      <T>Analysis: {profile.analysisState} · {profile.draft?.coverage === 'ready' ? 'Enough evidence to review' : 'Limited evidence — add your own interests'}</T>
      <T variant="small" muted>Sharing: {profile.sharing}. Published interests stay as approved until you publish again.</T>
      <Field label="Your title (blank restores generated title)" value={edits.title} onChangeText={title => draft.save({ ...edits, title })} maxLength={120} editable={!locked} />
    </Card>
    <SectionHeading title="Suggested interests" />
    {!profile.draft?.facets.length && <T muted>No inferred interests yet. You can choose them manually below.</T>}
    {profile.draft?.facets.map(facet => <Card key={`${facet.interest}:${facet.intent}`}>
      <T variant="place">{interestLabel(facet.interest)} · {facet.intent === 'enjoyed' ? 'Enjoyed' : 'Want to try'} · strength {facet.strength}/3</T>
      <Choices><Button label={`Confirm ${interestLabel(facet.interest)}`} variant="outline" disabled={locked} onPress={() => setOverride({ interest: facet.interest, intent: facet.intent, strength: facet.strength, action: 'prefer' })} />
        <Button label={`Dismiss ${interestLabel(facet.interest)}`} variant="ghost" disabled={locked} onPress={() => setOverride({ interest: facet.interest, intent: facet.intent, strength: facet.strength, action: 'dismiss' })} /></Choices>
      {profile.evidence.filter(evidence => facet.evidenceIds.includes(evidence.id)).map(evidence =>
        <View key={evidence.id} style={{ gap: 6 }}><T variant="small">{evidence.explanation}</T><T variant="small" muted>{evidence.source.kind} · {evidence.source.id} · {Math.round(evidence.confidence * 100)}% observation confidence</T>
          <Button label={edits.excludedSources.some(source => sameSource(source, evidence.source)) ? 'Restore this source' : 'Exclude this source'} variant="ghost" disabled={locked} onPress={() => draft.save({ ...edits, excludedSources: edits.excludedSources.some(source => sameSource(source, evidence.source)) ? edits.excludedSources.filter(source => !sameSource(source, evidence.source)) : [...edits.excludedSources, evidence.source] })} />
        </View>)}
    </Card>)}
    <SectionHeading title="Your explicit interests" />
    <T muted>Your saved choices take priority over later analysis. Up to 20 choices, including dismissals.</T>
    <Choices>{(['enjoyed', 'want_to_try'] as const).map(value => <Chip key={value} label={value === 'enjoyed' ? 'Enjoyed' : 'Want to try'} selected={intent === value} onPress={locked ? undefined : () => setIntent(value)} />)}</Choices>
    <Choices>{([1, 2, 3] as const).map(value => <Chip key={value} label={`Strength ${value}`} selected={strength === value} onPress={locked ? undefined : () => setStrength(value)} />)}</Choices>
    <Choices>{tasteInterests.map(interest => <Chip key={interest} label={interestLabel(interest)} selected={edits.overrides.some(item => item.interest === interest && item.intent === intent && item.action === 'prefer')}
      onPress={locked ? undefined : () => setOverride({ interest, intent, strength, action: 'prefer' })} />)}</Choices>
    {edits.overrides.map(override => <View key={`${override.interest}:${override.intent}`} style={{ gap: 6 }}>
      <T>{interestLabel(override.interest)} · {override.intent.replace(/_/g, ' ')} · {override.action} · {override.strength}/3</T>
      <Choices><Button label="Dismiss" variant="ghost" disabled={locked} onPress={() => setOverride({ ...override, action: 'dismiss' })} />
        <Button label="Remove override" variant="ghost" disabled={locked} onPress={() => draft.save({ ...edits, overrides: edits.overrides.filter(item => item !== override) })} /></Choices>
    </View>)}
    <SectionHeading title="Your preferences" />
    <T muted>Only you supply these preferences. They are not inferred from photos or shared with friends.</T>
    <T variant="label">Pace</T><Choices>{([null, 'relaxed', 'balanced', 'busy'] as const).map(pace => <Chip key={pace ?? 'unset'} label={pace ?? 'Not set'} selected={edits.preferences.pace === pace} onPress={locked ? undefined : () => draft.save({ ...edits, preferences: { ...edits.preferences, pace } })} />)}</Choices>
    <T variant="label">Budget</T><Choices>{([null, 'free', 'moderate', 'flexible'] as const).map(budget => <Chip key={budget ?? 'unset'} label={budget ?? 'Not set'} selected={edits.preferences.budget === budget} onPress={locked ? undefined : () => draft.save({ ...edits, preferences: { ...edits.preferences, budget } })} />)}</Choices>
    <Field label="Accessibility preferences (optional and private)" value={edits.preferences.accessibility ?? ''} maxLength={500} editable={!locked} onChangeText={accessibility => draft.save({ ...edits, preferences: { ...edits.preferences, accessibility: accessibility || null } })} multiline />
    <SectionHeading title="Excluded sources" />
    {edits.excludedSources.map(source => <Button key={sourceKey(source)} label={`Restore ${source.kind} ${source.id}`} variant="ghost" disabled={locked} onPress={() => draft.save({ ...edits, excludedSources: edits.excludedSources.filter(item => !sameSource(item, source)) })} />)}
    {!edits.excludedSources.length && <T muted>No excluded sources.</T>}
    <SectionHeading title="Photo collage" />
    <T muted>Select up to six moments you authored. Saving a selection keeps it private; publishing explicitly grants friends access to these photos.</T>
    <CollagePicker selected={edits.collage} onChange={collage => draft.save({ ...edits, collage })} disabled={locked} />
    {draft.error && <T accessibilityRole="alert">{draft.error}</T>}
    <ActionStatus action={action} />
    <Button label="Save title, interests and preferences" disabled={locked} onPress={save} />
    <TasteSources profile={profile} locked={locked} action={action} />
    <SectionHeading title="Publish only what you approve" />
    <Button label={publishOpen ? 'Close sharing review' : 'Review sharing'} variant="outline" disabled={locked} onPress={() => setPublishOpen(value => !value)} />
    {publishOpen && <PublishTaste profile={profile} action={action} />}
    <Button label="Make taste private now" variant="outline" disabled={locked || profile.sharing === 'private'} onPress={() => action.run({
      label: 'make taste private', path: '/api/taste/publish', method: 'POST',
      input: { expectedVersion: profile.version, sharing: 'private', title: null, facets: [], collageMomentIds: [], confirmShare: false } satisfies TastePublishRequest,
    })} />
    <Button label={deleteConfirm ? 'Keep my taste profile' : 'Remove taste profile'} variant="ghost" disabled={locked} onPress={() => setDeleteConfirm(value => !value)} />
    {deleteConfirm && <Card><T>This removes derived evidence and profile sharing. Your visits and source photos remain.</T>
      <Button label="Confirm remove profile" disabled={locked} onPress={() => action.run({ label: 'remove taste profile', path: '/api/taste', method: 'DELETE', input: { expectedVersion: profile.version } })} /></Card>}
  </View>;
}
function CollagePicker({ selected, onChange, disabled }: { selected: string[]; onChange: (ids: string[]) => void; disabled: boolean }) {
  const moments = useMemoryPage<MemoryMomentDto>('/api/moments');
  return <><ResourceStatus {...moments} /><T variant="small">{selected.length}/6 selected</T>
    {moments.data?.items.map(moment => <View key={moment.id} style={{ gap: 6 }}>
      <Chip label={`${moment.confirmedStop ? placeById(moment.confirmedStop.placeId)?.name ?? 'Confirmed memory' : 'Unresolved memory'} · ${moment.createdAt.slice(0, 10)}`}
        selected={selected.includes(moment.id)} onPress={disabled ? undefined : () => onChange(toggleId(selected, moment.id, 6))} />
      {selected.includes(moment.id) && <MemoryPhoto path={`/api/moments/${moment.id}/photo`} label="Your selected collage photo" />}
    </View>)}<PageButtons page={moments} />
    {!moments.data?.items.length && <Button label="Create a moment from your collection" variant="ghost" onPress={() => router.push('/albums')} />}</>;
}
function TasteSources({ profile, action, locked }: { profile: TasteProfileDto; action: ReturnType<typeof useMemoryActions>; locked: boolean }) {
  const { state } = useApp();
  const selection = useMemoryDraft(`taste-sources:${profile.version}:${profile.updatedAt}`, { sources: profile.selectedSources, note: '' });
  const [consent, setConsent] = useState(false);
  const [batchId, setBatchId] = useState<string>();
  const batches = useMemoryPage<ImportBatchDto>('/api/imports');
  const batch = useMemoryResource<ImportBatchDto>(batchId ? `/api/imports/${batchId}` : undefined);
  const selected = selection.value.sources;
  const choose = (source: TasteSourceRef) => {
    if (locked || !selection.ready) return;
    selection.save({ ...selection.value, sources: selected.some(item => sameSource(item, source)) ? selected.filter(item => !sameSource(item, source)) : selected.length < 100 ? [...selected, source] : selected });
  };
  const sourceChoice = (source: TasteSourceRef, label: string) => <Chip key={sourceKey(source)} label={label} selected={selected.some(item => sameSource(item, source))} onPress={locked ? undefined : () => choose(source)} />;
  return <><SectionHeading title="Refresh from selected sources" />
    <T muted>Only selected content is analyzed. Text and place facts can be used without image consent. Photos provide weak scene evidence, never identities, feelings or sensitive personal traits.</T>
    <T>{selected.length}/100 sources selected</T>
    <SectionHeading title="Your confirmed visits" /><Choices>{state.editions.map(edition => sourceChoice({ kind: 'edition', id: edition.id }, `${placeById(edition.placeId)?.name ?? 'Visit'} · ${edition.visitedAt.slice(0, 10)}`))}</Choices>
    <SectionHeading title="Saved, favorite and recommended places" /><Choices>
      {[...new Set(state.wishlists.flatMap(list => list.entries.filter(entry => entry.saverIds.includes('you')).map(entry => entry.placeId)))].map(id => sourceChoice({ kind: 'saved_place', id }, `Saved: ${placeById(id)?.name ?? id}`))}
      {state.favorites.map(id => sourceChoice({ kind: 'favorite', id }, `Favorite: ${placeById(id)?.name ?? id}`))}
      {state.assessments.filter(item => item.sentiment === 'recommend').map(item => sourceChoice({ kind: 'recommendation', id: item.placeId }, `Recommended: ${placeById(item.placeId)?.name ?? item.placeId}`))}
    </Choices>
    <SectionHeading title="Imported photos" /><ResourceStatus {...batches} />
    <Choices>{batches.data?.items.map(item => <Chip key={item.id} label={item.title} selected={batchId === item.id} onPress={() => setBatchId(item.id)} />)}</Choices><PageButtons page={batches} />
    <ResourceStatus {...batch} /><Choices>{batch.data?.items.filter(item => ['uploaded', 'ready', 'committed'].includes(item.state)).map(item => sourceChoice({ kind: 'import_item', id: item.id }, item.fileName))}</Choices>
    <SectionHeading title="Selected sources" />
    <Choices>{selected.map(source => <Chip key={sourceKey(source)} selected label={`Remove ${source.kind} ${source.id.slice(0, 8)}`} onPress={locked ? undefined : () => choose(source)} />)}</Choices>
    <Field label="Optional private context for this analysis" value={selection.value.note} maxLength={2000} editable={!locked && selection.ready} onChangeText={note => selection.save({ ...selection.value, note })} multiline />
    <Chip label="I consent to sending the selected images to the configured AI provider" selected={consent} onPress={locked ? undefined : () => setConsent(value => !value)} />
    {selected.some(source => source.kind === 'import_item') && !consent && <T muted>Imported photos require image consent. Remove them for text-only analysis.</T>}
    {selection.error && <T accessibilityRole="alert">{selection.error}</T>}
    <Button label={profile.analysisState === 'processing' ? 'Retry or resume analysis' : 'Refresh my profile'} disabled={locked || !selection.ready || !selected.length || (selected.some(source => source.kind === 'import_item') && !consent)} onPress={async () => {
      await action.run({ label: 'refresh taste analysis', path: '/api/taste/analyze', method: 'POST', input: {
        requestId: randomUUID(), expectedVersion: profile.version, sources: selected, note: selection.value.note || undefined, consentImages: consent,
      } satisfies TasteAnalyzeRequest }); setConsent(false);
    }} />
  </>;
}
function PublishTaste({ profile, action }: { profile: TasteProfileDto; action: ReturnType<typeof useMemoryActions> }) {
  const [title, setTitle] = useState(profile.titleOverride ?? profile.draft?.title ?? '');
  const [facets, setFacets] = useState<TasteFacet[]>(() => (profile.draft?.facets ?? []).map(({ interest, intent, strength }) => ({ interest, intent, strength })));
  const [collage, setCollage] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  return <Card><Field label="Title friends will see" value={title} maxLength={120} onChangeText={setTitle} editable={!action.locked} />
    <T muted>These saved draft interests are selected for publication. Tap to remove any. Unsaved edits above are not included.</T>
    <Choices>{profile.draft?.facets.map(facet => <Chip key={`${facet.interest}:${facet.intent}`} label={`${interestLabel(facet.interest)} · ${facet.intent.replace(/_/g, ' ')}`} selected={facets.some(item => item.interest === facet.interest && item.intent === facet.intent)}
      onPress={action.locked ? undefined : () => setFacets(current => current.some(item => item.interest === facet.interest && item.intent === facet.intent) ? current.filter(item => item.interest !== facet.interest || item.intent !== facet.intent) : [...current, { interest: facet.interest, intent: facet.intent, strength: facet.strength }])} />)}</Choices>
    <T muted>Photos require a separate grant. None are selected by default.</T>
    <Choices>{profile.collageMomentIds.map(id => <Chip key={id} label={`Share photo ${id.slice(0, 8)}`} selected={collage.includes(id)} onPress={action.locked ? undefined : () => setCollage(toggleId(collage, id, 6))} />)}</Choices>
    <Chip label="I approve sharing this title, these interests and selected photos with accepted friends" selected={consent} onPress={action.locked ? undefined : () => setConsent(value => !value)} />
    <Button label="Publish to friends" disabled={!consent || action.locked} onPress={() => action.run({ label: 'publish approved taste', path: '/api/taste/publish', method: 'POST', input: {
      expectedVersion: profile.version, sharing: 'friends', title: title.trim() || null, facets, collageMomentIds: collage, confirmShare: true,
    } satisfies TastePublishRequest })} />
  </Card>;
}
