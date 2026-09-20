import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type {
  ImportAnalyzeRequest, ImportBatchCreate, ImportBatchDto, ImportCommitDto, ImportCommitRequest,
  ImportItemDto, ImportItemPatch, ImportMetadata,
} from '../../../../../shared/memories-contract';
import { Button, Chip, Field, SectionHeading, T } from '@/components/ui';
import { canCommitItem, interestLabel, parseMemoryInstant, toggleId } from '@/domain/memories';
import { validTimezone } from '@/domain/capture';
import { useApp } from '@/state/AppProvider';
import { batchPath, itemPath } from '@/lib/memoriesApi';
import { useMemoryActions, useMemoryDraft, useMemoryPage, useMemoryResource } from '@/lib/useMemories';
import { importQueueKey, readImportQueue, selectImportPhotos, uploadImportPhoto, type LocalImportPhoto } from '@/lib/memoryUploads';
import { ResourceStatus } from '@/features/discovery/AccountPlaceDetail';
import { ActionStatus, AlbumChoices, Card, Choices, MemoryPhoto, PageButtons, StopEditor } from './MemoryUi';

export function Imports() {
  const batches = useMemoryPage<ImportBatchDto>('/api/imports');
  const draft = useMemoryDraft('new-import', { title: '' });
  const action = useMemoryActions('new-import', batches.reload);
  const create = async (retry = false) => {
    const batch = await action.run<ImportBatchDto>(retry ? undefined : { label: 'create import batch', path: '/api/imports', method: 'POST', input: { requestId: randomUUID(), title: draft.value.title.trim() } satisfies ImportBatchCreate });
    draft.save({ title: '' });
    router.push({ pathname: '/memories/[batchId]', params: { batchId: batch.id } });
  };
  return <>
    <T muted>Select real photos from your device. Imports stay private until you explicitly contribute a moment to an album or tag a friend.</T>
    <Field label="New batch title" value={draft.value.title} maxLength={120} editable={draft.ready && !action.locked} onChangeText={title => draft.save({ title })} />
    <Button label="Create photo import" disabled={!draft.ready || !draft.value.title.trim() || action.locked} onPress={() => create()} />
    {action.error && <T accessibilityRole="alert">{action.error}</T>}
    {action.pending && <Button label="Resume creating batch" loading={action.busy} onPress={() => create(true)} />}
    {draft.error && <T accessibilityRole="alert">{draft.error}</T>}
    <SectionHeading title="Resume an import" /><ResourceStatus {...batches} />
    {batches.data?.items.map(batch => <Card key={batch.id}><T variant="heading">{batch.title}</T><T>{batch.state} · {batch.items.length}/20 photos</T>
      <Button label="Review or resume" variant="outline" onPress={() => router.push({ pathname: '/memories/[batchId]', params: { batchId: batch.id } })} /></Card>)}
    {batches.data && !batches.data.items.length && <T muted>No imported batches yet.</T>}<PageButtons page={batches} />
  </>;
}
export function ImportBatch({ batchId }: { batchId: string }) {
  const batch = useMemoryResource<ImportBatchDto>(batchPath(batchId));
  return <><ResourceStatus {...batch} />{batch.data && !batch.error && <BatchEditor batch={batch.data} reload={batch.reload} />}</>;
}
function BatchEditor({ batch, reload }: { batch: ImportBatchDto; reload: () => void }) {
  const { userId, accountRequest, assertAccountCurrent, refresh } = useApp();
  const action = useMemoryActions(`batch:${batch.id}`, reload);
  const [queue, setQueue] = useState<LocalImportPhoto[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [remove, setRemove] = useState(false);
  const [committed, setCommitted] = useState<ImportCommitDto>();
  const draft = useMemoryDraft(`batch-review:${batch.id}`, { selected: [] as string[], visits: [] as string[], albumId: null as string | null, note: '' });
  useEffect(() => {
    let active = true;
    if (userId) void readImportQueue(userId, batch.id).then(value => {
      assertAccountCurrent(); if (active) { setQueue(value); setQueueReady(true); }
    }).catch(() => { if (active) setProblems(['The saved upload queue could not be read. Your server batch is still available.']); });
    return () => { active = false; };
  }, [userId, batch.id, assertAccountCurrent]);
  const storeQueue = async (next: LocalImportPhoto[]) => {
    assertAccountCurrent();
    if (!userId) throw new Error('Sign in to upload.');
    await AsyncStorage.setItem(importQueueKey(userId, batch.id), JSON.stringify(next));
    assertAccountCurrent(); setQueue(next);
  };
  const runLocal = async (work: () => Promise<void>) => {
    setBusy(true); setProblems([]);
    try { await work(); } catch (reason) { assertAccountCurrent(); setProblems([reason instanceof Error ? reason.message : 'Could not finish. Retry.']); }
    finally { setBusy(false); }
  };
  const locked = busy || action.locked || !draft.ready || !queueReady;
  const selected = batch.items.filter(item => draft.value.selected.includes(item.id));
  const eligible = selected.filter(canCommitItem);
  const analyzeIds = selected.filter(item => ['uploaded', 'ready', 'failed', 'processing'].includes(item.state)).map(item => item.id);
  const select = async () => {
    const remaining = 20 - batch.items.length - queue.filter(photo => !batch.items.some(item => item.sha256 === photo.input.sha256)).length;
    const result = await selectImportPhotos(remaining, assertAccountCurrent);
    await storeQueue([...queue, ...result.photos]);
    setProblems(result.problems);
  };
  const upload = async () => {
    if (!userId) return;
    let remaining = [...queue];
    for (const photo of queue) {
      await uploadImportPhoto(accountRequest, assertAccountCurrent, userId, batch.id, photo);
      assertAccountCurrent();
      remaining = remaining.filter(item => item.input.requestId !== photo.input.requestId);
      await storeQueue(remaining);
    }
    reload();
  };
  const commit = async () => {
    const result = await action.run<ImportCommitDto>({ label: 'commit selected memories', path: `${batchPath(batch.id)}/commit`, method: 'POST', input: {
      requestId: randomUUID(), expectedVersion: batch.version,
      target: draft.value.albumId ? { kind: 'album', albumId: draft.value.albumId, confirmShare: true } : { kind: 'private' },
      items: eligible.map(item => ({ itemId: item.id, createVisit: draft.value.visits.includes(item.id), note: draft.value.note.trim() || null })),
    } satisfies ImportCommitRequest });
    setCommitted(result); draft.save({ ...draft.value, selected: [], visits: [] }); await refresh();
  };
  return <View style={{ gap: 12 }}>
    <T variant="heading">{batch.title}</T><T>{batch.state} · {batch.items.length}/20 items · revision {batch.version}</T>
    <T muted>JPEG, PNG or WebP only, at most 10 MiB each. HEIC and other formats must be exported first. Dates and GPS metadata are suggestions, not confirmed visits.</T>
    <Button label="Select photos from this device" disabled={locked || batch.items.length >= 20 || batch.state === 'cancelled'} onPress={() => runLocal(select)} />
    {queue.map(photo => <Card key={photo.input.requestId}><T>{photo.input.fileName} · {(photo.input.sizeBytes / 1024 / 1024).toFixed(1)} MiB</T><T variant="small" muted>Saved on this device; ready to upload or retry.</T>
      <Button label="Remove from local upload queue" variant="ghost" disabled={locked} onPress={() => runLocal(() => storeQueue(queue.filter(item => item.input.requestId !== photo.input.requestId)))} /></Card>)}
    {!!queue.length && <Button label={`Upload or retry ${queue.length} photos`} disabled={locked} onPress={() => runLocal(upload)} />}
    {problems.map((problem, index) => <T key={index} accessibilityRole="alert">{problem}</T>)}
    <Button label="Refresh server progress" variant="outline" disabled={busy} onPress={reload} />
    <T muted>You can close this screen and resume later. Uploads need the same device’s stored photos; uploaded items are available across your clients.</T>
    <SectionHeading title="Review each photo" />
    {batch.items.map(item => <Card key={item.id}>
      <Chip label={`Select ${item.fileName}`} selected={draft.value.selected.includes(item.id)} onPress={locked ? undefined : () => draft.save({ ...draft.value, selected: toggleId(draft.value.selected, item.id, 20) })} />
      <ImportItem key={`${item.id}:${item.version}`} item={item} reload={reload} disabled={busy} />
      {canCommitItem(item) && <Chip label={item.confirmedStop ? 'Also create my private visit' : 'Confirm a historical stop before creating a visit'} selected={draft.value.visits.includes(item.id)} onPress={locked || !item.confirmedStop ? undefined : () => draft.save({ ...draft.value, visits: toggleId(draft.value.visits, item.id, 20) })} />}
    </Card>)}
    <SectionHeading title="Optional scene analysis" />
    <T muted>Select up to five uploaded photos per call. Failed or interrupted items can be retried; the server limits attempts. You can commit uploaded photos without AI.</T>
    <Chip label="I consent to sending these selected photos to the configured AI provider for scene interests" selected={consent} onPress={locked ? undefined : () => setConsent(value => !value)} />
    <Button label={`Analyze or retry selected (${analyzeIds.length}/5)`} disabled={locked || !consent || !analyzeIds.length || analyzeIds.length > 5} onPress={async () => {
      await action.run({ label: 'analyze import photos', path: `${batchPath(batch.id)}/analyze`, method: 'POST', input: { requestId: randomUUID(), expectedVersion: batch.version, itemIds: analyzeIds, consentImages: true } satisfies ImportAnalyzeRequest });
      setConsent(false);
    }} />
    <SectionHeading title="Keep selected memories" />
    <T muted>Only selected uploaded or ready photos are committed. Duplicates and already committed items are excluded. Visits are created only for checked items with a confirmed historical stop.</T>
    <AlbumChoices selected={draft.value.albumId} onChange={albumId => draft.save({ ...draft.value, albumId })} disabled={locked} />
    <Field label={draft.value.albumId ? 'Note visible to album members (optional)' : 'Private moment note (optional)'} value={draft.value.note} maxLength={2000} multiline editable={!locked} onChangeText={note => draft.save({ ...draft.value, note })} />
    {draft.value.albumId && <T>Contributing grants accepted album members access to the selected moments, photos, historical stops and the note above. Source batches remain private.</T>}
    <Button label={draft.value.albumId ? `Confirm sharing ${eligible.length} memories with this album` : `Keep ${eligible.length} private memories`} disabled={locked || !eligible.length || eligible.some(item => draft.value.visits.includes(item.id) && !item.confirmedStop)} onPress={commit} />
    <ActionStatus action={action} />
    {draft.error && <T accessibilityRole="alert">{draft.error}</T>}
    {committed && <Card><T>{committed.moments.length} moments kept · {committed.editionIds.length} private visits created.</T>
      {committed.moments.map(moment => <Button key={moment.id} label="Open moment and tag friends" variant="outline" onPress={() => router.push({ pathname: '/moment/[momentId]', params: { momentId: moment.id } })} />)}
    </Card>}
    <Button label={remove ? 'Cancel batch removal' : 'Remove batch and revoke derived access'} variant="ghost" disabled={locked} onPress={() => setRemove(value => !value)} />
    {remove && <Card><T>This revokes derived moments and taste evidence. Separately created private visits remain.</T><Button label="Confirm remove batch" disabled={locked} onPress={async () => {
      await action.run({ label: 'remove import batch', path: batchPath(batch.id), method: 'DELETE', input: { expectedVersion: batch.version } });
      await storeQueue([]); router.replace('/memories');
    }} /></Card>}
  </View>;
}
function ImportItem({ item, reload, disabled }: { item: ImportItemDto; reload: () => void; disabled: boolean }) {
  const action = useMemoryActions(`import-item:${item.id}`, reload);
  const [review, setReview] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [remove, setRemove] = useState(false);
  const draft = useMemoryDraft(`item:${item.id}:${item.version}`, { groupKey: item.groupKey ?? '' });
  const locked = disabled || action.locked || !draft.ready;
  const patch = (values: Omit<ImportItemPatch, 'expectedVersion'>) => action.run({ label: 'save photo review', path: itemPath(item.batchId, item.id), method: 'PATCH', input: { expectedVersion: item.version, ...values } satisfies ImportItemPatch });
  return <>
    <T>{item.state} · {(item.sizeBytes / 1024 / 1024).toFixed(1)} MiB</T>
    {item.state === 'duplicate' && <T muted>Duplicate of {item.duplicateOfItemId}. No extra visit or evidence will be created.</T>}
    {item.error && <T accessibilityRole="alert">{item.error.message} {item.error.retryable ? 'Select and retry analysis.' : 'Review this item or remove it.'}</T>}
    <T variant="small" muted>Metadata: {item.metadata.capturedAt ?? 'date missing'} · {item.metadata.timezone ?? 'timezone missing'} · {item.metadata.latitude === null ? 'GPS missing' : 'GPS present'}</T>
    <T>Historical stop: {item.confirmedStop ? `${item.confirmedStop.capturedAt} · ${item.confirmedStop.timezone}` : 'Unresolved — no visit will be created'}</T>
    {item.analysis && <><T>{item.analysis.scene ?? 'No scene description'}</T><T variant="small" muted>{item.analysis.interests.map(interestLabel).join(', ')} · weak photo evidence</T></>}
    <Choices><Button label={photo ? 'Hide photo' : 'View photo'} variant="ghost" disabled={item.state === 'pending_upload'} onPress={() => setPhoto(value => !value)} />
      <Button label={review ? 'Close review' : 'Edit date, place and grouping'} variant="outline" disabled={locked || item.state === 'committed' || item.state === 'duplicate'} onPress={() => setReview(value => !value)} /></Choices>
    {photo && <MemoryPhoto path={`${itemPath(item.batchId, item.id)}/photo`} label={item.fileName} />}
    {item.editionId && <Button label="Open private visit" variant="outline" onPress={() => router.push({ pathname: '/edition/[editionId]', params: { editionId: item.editionId! } })} />}
    {review && <>
      <StopEditor scope={`item:${item.id}:${item.version}`} value={item.confirmedStop} disabled={locked} onSave={confirmedStop => patch({ confirmedStop })} />
      <Field label="Group key (same key merges; different keys split within a day/place)" value={draft.value.groupKey} maxLength={80} editable={!locked} onChangeText={groupKey => draft.save({ groupKey })} />
      <Button label="Save grouping" disabled={locked} onPress={() => patch({ groupKey: draft.value.groupKey.trim() || null })} />
      <MetadataEditor scope={`${item.id}:${item.version}`} metadata={item.metadata} disabled={locked} onSave={metadata => patch({ metadata })} />
    </>}
    <ActionStatus action={action} />
    <Button label={remove ? 'Cancel removal' : 'Remove this item'} variant="ghost" disabled={locked} onPress={() => setRemove(value => !value)} />
    {remove && <Button label="Confirm remove item and derived access" disabled={locked} onPress={() => action.run({ label: 'remove import photo', path: itemPath(item.batchId, item.id), method: 'DELETE', input: { expectedVersion: item.version } })} />}
  </>;
}
function MetadataEditor({ scope, metadata, onSave, disabled }: { scope: string; metadata: ImportMetadata; onSave: (value: ImportMetadata) => Promise<unknown>; disabled: boolean }) {
  const draft = useMemoryDraft(`metadata:${scope}`, { instant: metadata.capturedAt ?? '', timezone: metadata.timezone ?? '', latitude: metadata.latitude?.toString() ?? '', longitude: metadata.longitude?.toString() ?? '' });
  const { instant, timezone, latitude, longitude } = draft.value;
  const locked = disabled || !draft.ready;
  const [error, setError] = useState<string>();
  const save = async () => {
    setError(undefined);
    try {
      const capturedAt = instant ? parseMemoryInstant(instant) : null;
      if (instant && !capturedAt) throw new Error('Enter an ISO instant with an explicit UTC offset, or leave it blank.');
      if (timezone && !validTimezone(timezone)) throw new Error('Enter an IANA timezone or leave it blank.');
      const lat = latitude.trim() ? Number(latitude) : null;
      const lng = longitude.trim() ? Number(longitude) : null;
      if ((lat === null) !== (lng === null) || (lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180))) throw new Error('Enter both valid GPS coordinates or clear both.');
      await onSave({ capturedAt, timezone: timezone || null, latitude: lat, longitude: lng, accuracyM: null, origin: 'manual' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save metadata.'); }
  };
  return <Card><T variant="place">Correct optional metadata</T><T muted>This changes suggestions only. Confirm the historical stop separately.</T>
    <Field label="Suggested capture instant (optional)" value={instant} onChangeText={instant => draft.save({ ...draft.value, instant })} editable={!locked} autoCapitalize="none" />
    <Field label="Suggested IANA timezone (optional)" value={timezone} onChangeText={timezone => draft.save({ ...draft.value, timezone })} editable={!locked} autoCapitalize="none" />
    <Field label="Suggested latitude (optional)" value={latitude} onChangeText={latitude => draft.save({ ...draft.value, latitude })} editable={!locked} keyboardType="numbers-and-punctuation" />
    <Field label="Suggested longitude (optional)" value={longitude} onChangeText={longitude => draft.save({ ...draft.value, longitude })} editable={!locked} keyboardType="numbers-and-punctuation" />
    {draft.error && <T accessibilityRole="alert">{draft.error}</T>}
    {error && <T accessibilityRole="alert">{error}</T>}<Button label="Save metadata corrections" disabled={locked} onPress={save} />
  </Card>;
}
