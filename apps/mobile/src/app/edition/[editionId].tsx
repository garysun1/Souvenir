import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Avatar, AvatarStack, Button, ChipRow, EmptyState, Field, Header, Icon, Screen, Sheet, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { editionStamp, validateVisit } from '@/domain/capture';
import type { Edition } from '@/domain/types';
import { placeById, users } from '@/fixtures/catalog';
import { visitDate } from '@/state/selectors';
import { useApp } from '@/state/AppProvider';
import { deleteMedia } from '@/platform/media';
import { DateTimeField } from '@/features/capture/DateTimeField';
import { captureStyles } from '@/features/capture/styles';

const value = (input?: string | string[]) => Array.isArray(input) ? input[0] : input;
export default function EditionDetail() {
  const params = useLocalSearchParams<{ editionId?: string }>();
  const { state, commit } = useApp();
  const editionId = value(params.editionId);
  const edition = state.editions.find(item => item.id === editionId && item.ownerId === 'you');
  const place = edition ? placeById(edition.placeId) : undefined;
  const [editing, setEditing] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  const [edit, setEdit] = useState<Pick<Edition, 'moment' | 'visitedAt' | 'companions'>>(() => edition ? { moment: edition.moment, visitedAt: edition.visitedAt, companions: edition.companions } : { moment: '', visitedAt: state.clock, companions: [] });
  const [tip, setTip] = useState(() => edition ? state.tips[edition.placeId] ?? '' : '');
  if (!edition || !place) return <Screen><Header title="Edition unavailable" back /><EmptyState icon="image" title="This edition isn’t here" message="It may have been deleted, or the link is no longer valid." action="Return to Collection" onPress={() => router.replace('/collection')} /></Screen>;
  const assessment = state.assessments.find(item => item.placeId === place.id);
  const outing = edition.outingId ? state.outings.find(item => item.id === edition.outingId) : undefined;
  const momentLimit = state.mode === 'account' ? 2000 : 160;
  const dateError = validateVisit(edit.visitedAt, state.mode === 'account' ? new Date().toISOString() : state.clock, edit.moment, momentLimit);
  const openEdit = () => { setEdit({ moment: edition.moment, visitedAt: edition.visitedAt, companions: edition.companions }); setError(undefined); setEditing(true); };
  const saveEdit = async () => {
    if (dateError) return;
    try { await commit({ type: 'EDIT_EDITION', id: edition.id, patch: { ...edit, moment: edit.moment.trim() } }); setEditing(false); }
    catch { setError('Your changes could not be saved. The editor is still open; retry.'); }
  };
  const removeEdition = async () => {
    try {
      const next = await commit({ type: 'DELETE_EDITION', id: edition.id });
      if (edition.photoUri && next.captureDraft?.photoUri !== edition.photoUri && !next.editions.some(item => item.photoUri === edition.photoUri)) await deleteMedia(edition.photoUri).catch(() => undefined);
      setDeleting(false); router.replace('/collection');
    } catch { setError('Deletion could not be confirmed. Refresh to check its status, then retry.'); setDeleting(false); }
  };
  const share = async () => {
    try { await Share.share({ title: `${place.name} · Souvenir`, message: `My ${editionStamp(edition.sequence).toLowerCase()} at ${place.name} on ${visitDate(edition.visitedAt)}.${edition.moment ? ` ${edition.moment}` : ''}` }); }
    catch { setError('Sharing is unavailable on this device.'); }
  };
  return <Screen padded={false}>
    <View style={{ paddingHorizontal: 22 }}><Header title="Your edition" back /></View>
    <PlacePhoto placeId={place.id} uri={edition.photoUri} style={{ height: 390, borderRadius: 0 }} />
    <View style={{ paddingHorizontal: 22, paddingTop: 22, gap: 16 }}>
      <View><T style={captureStyles.tinyCaps}>Personal edition</T><T variant="title">{place.name}</T><T muted>{place.neighborhood}</T></View>
      <View style={captureStyles.stamp}><T variant="small" color="#144F5D">{editionStamp(edition.sequence)}</T></View>
      <View style={captureStyles.detailCard}><View style={[captureStyles.row, { justifyContent: 'space-between' }]}><View><T variant="label">Visited</T><T muted>{visitDate(edition.visitedAt)}</T><T variant="small" muted>{new Intl.DateTimeFormat('en-US', { timeZone: edition.timezone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(edition.visitedAt))}</T></View>{edition.companions.length > 0 && <AvatarStack ids={edition.companions} />}</View>{edition.companions.length > 0 && <T variant="small" muted>With {edition.companions.map(id => users.find(user => user.id === id)?.name ?? id).join(', ')}</T>}{edition.moment ? <><T variant="label">Your moment</T><T>{edition.moment}</T></> : <T muted>No moment added yet.</T>}</View>
      {outing && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/outing/[outingId]', params: { outingId: outing.id } })} style={captureStyles.choice}><Icon name="people" /><View style={{ flex: 1 }}><T variant="label">{outing.title}</T><T variant="small" muted>Associated outing</T></View><Icon name="chevron" /></Pressable>}
      <View style={captureStyles.detailCard}><T variant="label">Recommendation</T><T>{assessment ? assessment.sentiment === 'recommend' ? 'You recommend it' : assessment.sentiment === 'depends' ? 'It depends' : 'You would skip it' : 'Not rated yet'}</T><Button label={assessment ? 'Edit recommendation' : 'Recommend it?'} variant="outline" onPress={() => router.push({ pathname: '/recommend/[placeId]', params: { placeId: place.id, editionId: edition.id } })} /></View>
      {state.tips[place.id] && <View style={captureStyles.detailCard}><T variant="label">Private tip</T><T>{state.tips[place.id]}</T></View>}
      {error && <View style={captureStyles.error}><T color="#A3383C">{error}</T></View>}
      <Button label="View shared place" onPress={() => router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } })} />
      <Button label="Edit visit details" variant="outline" icon="edit" onPress={openEdit} />
      <Button label={state.favorites.includes(place.id) ? 'Remove place from favorites' : 'Favorite this place'} variant="outline" icon="heart" onPress={() => commit({ type: 'FAVORITE', placeId: place.id })} />
      <Button label={state.tips[place.id] ? 'Edit private tip' : 'Add private tip'} variant="outline" icon="edit" onPress={() => { setTip(state.tips[place.id] ?? ''); setTipOpen(true); }} />
      <Button label="Share edition" variant="outline" icon="share" onPress={share} />
      <Button label="Delete edition" variant="ghost" onPress={() => setDeleting(true)} />
    </View>
    <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit this edition">
      <DateTimeField value={edit.visitedAt} onChange={visitedAt => setEdit(current => ({ ...current, visitedAt }))} />
      {dateError && <T color="#A3383C">{dateError}</T>}
      {state.mode === 'account' ? <Field label="Companion names (comma separated)" value={edit.companions.join(', ')} onChangeText={value => setEdit(current => ({ ...current, companions: value.split(',').map(name => name.trim()) }))} /> : <View><T variant="label">Companions</T><ChipRow>{users.filter(user => user.id !== 'you').map(user => { const selected = edit.companions.includes(user.id); return <Pressable key={user.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setEdit(current => ({ ...current, companions: selected ? current.companions.filter(id => id !== user.id) : [...current.companions, user.id] }))} style={captureStyles.avatarChoice}><Avatar userId={user.id} size={42} /><T variant="small">{selected ? '✓ ' : ''}{user.name}</T></Pressable>; })}</ChipRow></View>}
      <Field label="Moment" value={edit.moment} onChangeText={moment => setEdit(current => ({ ...current, moment: moment.slice(0, momentLimit) }))} multiline maxLength={momentLimit} />
      <T variant="small" muted style={{ textAlign: 'right' }}>{edit.moment.length}/{momentLimit}</T>
      {error && <T color="#A3383C">{error}</T>}<Button label="Save changes" disabled={!!dateError} onPress={saveEdit} />
    </Sheet>
    <Sheet visible={tipOpen} onClose={() => setTipOpen(false)} title="Private tip">
      <T muted>This private note belongs to the place and remains if this edition is deleted. {state.mode === 'account' ? 'It syncs only to your account.' : 'It stays on this device.'}</T><Field label="Tip" value={tip} onChangeText={value => setTip(value.slice(0, 280))} multiline maxLength={280} /><T variant="small" muted style={{ textAlign: 'right' }}>{tip.length}/280</T><Button label="Save private tip" onPress={async () => { await commit({ type: 'TIP', placeId: place.id, text: tip.trim() }); setTipOpen(false); }} />
    </Sheet>
    <Sheet visible={deleting} onClose={() => setDeleting(false)} title="Delete this edition?">
      <T>This removes the personal photo, date, companions, and moment.</T>
      <T muted>{state.editions.filter(item => item.ownerId === 'you' && item.placeId === place.id).length === 1 ? 'This is your last edition here. The place will leave Been, set progress may decrease, and its recommendation/ranking will be removed. Saves, favorite status, and private tips remain.' : 'Your other editions at this place remain. Unique-place and set progress will not change.'}</T>
      <Button label="Keep edition" variant="outline" onPress={() => setDeleting(false)} />
      <Button label="Delete permanently" onPress={removeEdition} />
    </Sheet>
  </Screen>;
}
