import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar, Button, ChipRow, Field, Icon, Screen, Sheet, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import type { CaptureDraft } from '@/domain/types';
import { identifyCapture, localVisitInput, suspectedDuplicate, validateVisit } from '@/domain/capture';
import { categoryLabels, placeById, users } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { CaptureHeader } from '@/features/capture/CaptureHeader';
import { CaptureUnavailable } from '@/features/capture/Unavailable';
import { DateTimeField } from '@/features/capture/DateTimeField';
import { PlaceSearchSheet } from '@/features/capture/PlaceSearchSheet';
import { captureStyles } from '@/features/capture/styles';

const value = (input?: string | string[]) => Array.isArray(input) ? input[0] : input;
export default function ConfirmCapture() {
  const { state, commit } = useApp();
  const draft = state.captureDraft;
  const params = useLocalSearchParams<{ candidates?: string; note?: string }>();
  const candidates = value(params.candidates)?.split(',').filter(id => !!placeById(id)) ?? (draft ? identifyCapture(draft).candidates : []);
  const [local, setLocal] = useState<CaptureDraft | undefined>(draft ?? undefined);
  const [placeSearch, setPlaceSearch] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [separate, setSeparate] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  if (!draft || !local || draft.id !== local.id || !['confirm', 'reveal'].includes(draft.status)) return <CaptureUnavailable />;
  const place = local.placeId ? placeById(local.placeId) : undefined;
  const visitError = validateVisit(local.visitedAt, state.mode === 'account' ? new Date().toISOString() : state.clock, local.moment);
  const patch = (update: Partial<CaptureDraft>) => {
    const next = { ...local, ...update, status: 'confirm' as const };
    setLocal(next); setSaveError(undefined);
    void commit({ type: 'DRAFT', draft: next }).catch(() => setSaveError('Your latest edit could not be saved. Retry before revealing.'));
  };
  const reveal = async (forceSeparate = false) => {
    if (!place || visitError) return;
    const duplicate = suspectedDuplicate(state, local);
    if (duplicate && !separate && !forceSeparate) { setDuplicateOpen(true); return; }
    const next = { ...local, status: 'reveal' as const };
    try { await commit({ type: 'DRAFT', draft: next }); router.replace('/capture/reveal'); }
    catch { setSaveError('Your draft could not be saved. It is still on this screen; retry when storage is available.'); }
  };
  return <Screen>
    <CaptureHeader title="Confirm your visit" />
    <PlacePhoto placeId={place?.id ?? ''} uri={local.photoUri} style={captureStyles.photo} />
    {!local.photoUri && <View style={[captureStyles.notice, { marginTop: 14 }]}><T variant="label">Catalog-only capture</T><T variant="small" muted>You can save the visit without a personal photograph.</T></View>}
    <View style={{ marginTop: 22, gap: 18 }}>
      <View style={captureStyles.detailCard}><View style={captureStyles.row}><Icon name="pin" /><View style={{ flex: 1 }}>{place ? <><T variant="place">{place.name}</T><T variant="small" muted>{categoryLabels[place.category]} · {place.neighborhood}</T></> : <><T variant="place">Choose the place</T><T variant="small" muted>We won’t guess from an arbitrary photo.</T></>}</View></View><Button label={place ? 'Change place' : 'Search catalog'} variant="outline" onPress={() => setPlaceSearch(true)} /></View>
      {value(params.note) && <View style={captureStyles.notice}><T variant="small">{value(params.note)}</T></View>}
      <DateTimeField value={local.visitedAt} onChange={visitedAt => patch({ visitedAt })} />
      <T variant="small" muted>{state.mode === 'account' ? 'Visit timezone: America/Los_Angeles.' : `Demo clock: ${localVisitInput(state.clock).replace('T', ' ')} · Los Angeles.`} Photo dates, when available, are editable suggestions interpreted in this timezone.</T>
      {visitError && <T color="#A3383C" accessibilityRole="alert">{visitError}</T>}
      {state.mode === 'account' ? <Field label="Companions (names, separated by commas)" value={local.companions.join(',')} onChangeText={text => patch({ companions: text.split(',') })} /> : <View><T variant="label">Companions</T><T variant="small" muted>Selecting someone records who was there; it does not invite them.</T><ChipRow>{users.filter(user => user.id !== 'you').map(user => { const selected = local.companions.includes(user.id); return <Pressable key={user.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => patch({ companions: selected ? local.companions.filter(id => id !== user.id) : [...local.companions, user.id] })} style={captureStyles.avatarChoice}><Avatar userId={user.id} size={42} /><T variant="small" color={selected ? '#144F5D' : undefined}>{selected ? '✓ ' : ''}{user.name}</T></Pressable>; })}</ChipRow></View>}
      {local.outingId && <View style={captureStyles.detailCard}><T variant="label">Linked outing</T><T>{state.outings.find(item => item.id === local.outingId)?.title ?? 'Accepted plan'}</T><Button label="Remove outing link" variant="ghost" onPress={() => patch({ outingId: undefined })} /></View>}
      <Field label="Moment (optional)" value={local.moment} onChangeText={moment => patch({ moment: moment.slice(0, 160) })} placeholder="What stayed with you?" multiline maxLength={160} />
      <T variant="small" muted style={{ textAlign: 'right' }}>{local.moment.length}/160</T>
      {saveError && <View style={captureStyles.error}><T color="#A3383C">{saveError}</T></View>}
      <Button label="Confirm & reveal" icon="sparkles" disabled={!place || !!visitError} onPress={() => reveal()} />
    </View>
    <PlaceSearchSheet visible={placeSearch} onClose={() => setPlaceSearch(false)} onChoose={placeId => patch({ placeId })} candidateIds={candidates} />
    <Sheet visible={duplicateOpen} onClose={() => setDuplicateOpen(false)} title="This looks familiar">
      <T muted>The same local photo and visit time already belong to an edition. Open it, or explicitly keep this as a separate visit.</T>
      <Button label="Open existing edition" onPress={() => { const existing = suspectedDuplicate(state, local); setDuplicateOpen(false); if (existing) router.push({ pathname: '/edition/[editionId]', params: { editionId: existing.id } }); }} />
      <Button label="Save as a separate visit" variant="outline" onPress={() => { setSeparate(true); setDuplicateOpen(false); void reveal(true); }} />
    </Sheet>
  </Screen>;
}
