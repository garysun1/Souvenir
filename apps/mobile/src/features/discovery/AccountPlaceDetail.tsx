import { Image } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import type { PlaceDetailDto, PlaceNoteDto, PlaceNoteKind, PlaceSuggestionCreate, Visibility } from '../../../../../shared/worldwide-contract';
import { Button, Chip, ChipRow, Field, Header, Screen, SectionHeading, T } from '@/components/ui';
import { placeById } from '@/fixtures/catalog';
import { useAccountResource } from '@/lib/useAccountResource';
import { useAccountMutation } from '@/lib/useAccountMutation';
import { availableImages, frequencyLabel, placePath, safeWebUrl } from '@/lib/worldwide';
import { useApp } from '@/state/AppProvider';
import { appealFor } from '@/domain/search';
import { mapPlace } from '@/lib/bootstrap';

export function ResourceStatus({ loading, error, reload }: { loading: boolean; error?: string; reload: () => void }) {
  return <>{loading && <ActivityIndicator accessibilityLabel="Loading account data" />}{error && <><T accessibilityRole="alert">{error}</T><Button label="Retry" onPress={reload} /></>}</>;
}
export function SourceLink({ url, label }: { url?: string | null; label: string }) {
  const safe = safeWebUrl(url);
  const [error, setError] = useState(false);
  return safe ? <><Button variant="ghost" label={label} onPress={async () => { try { await Linking.openURL(safe); } catch { setError(true); } }} />{error && <T selectable>{safe}</T>}</> : null;
}
function VisibilityPicker({ value, onChange, locked }: { value: Visibility; onChange: (value: Visibility) => void; locked: boolean }) {
  return <ChipRow>{(['private', 'friends', 'public'] as const).map(item => <Chip key={item} label={item} selected={value === item} onPress={locked ? undefined : () => onChange(item)} />)}</ChipRow>;
}
function NoteEditor({ path, note, onSaved }: { path: string; note?: PlaceNoteDto; onSaved: () => void }) {
  const [body, setBody] = useState(note?.body ?? '');
  const [visibility, setVisibility] = useState<Visibility>(note?.visibility ?? 'private');
  const [kind, setKind] = useState<PlaceNoteKind>(note?.kind ?? 'tip');
  const mutation = useAccountMutation();
  return <View style={{ gap: 10, paddingVertical: 12 }}>
    <Field label={note ? 'Edit your note' : 'New note'} value={body} onChangeText={setBody} editable={!mutation.locked} maxLength={600} multiline />
    <ChipRow>{(['tip', 'warning', 'hours', 'access', 'story'] as const).map(value => <Chip key={value} label={value} selected={kind === value} onPress={mutation.locked ? undefined : () => setKind(value)} />)}</ChipRow>
    <VisibilityPicker value={visibility} onChange={setVisibility} locked={mutation.locked} />
    {mutation.error && <T accessibilityRole="alert">{mutation.error}</T>}
    {mutation.locked && <T muted>Keep this form open. Retry sends the original submitted change.</T>}
    <Button label={mutation.locked ? 'Retry note change' : note ? 'Save note' : 'Add note'} disabled={!body.trim()} loading={mutation.busy} onPress={async () => {
      await mutation.run(note ? `${path}/notes/${note.id}` : `${path}/notes`, note ? 'PATCH' : 'POST', { ...(note ? {} : { requestId: randomUUID() }), body: body.trim(), kind, visibility });
      if (!note) setBody('');
      onSaved();
    }} />
    {note && !mutation.locked && <Button label="Delete note" variant="outline" onPress={async () => { await mutation.run(`${path}/notes/${note.id}`, 'DELETE'); onSaved(); }} />}
  </View>;
}
function TagEditor({ path, tags, onSaved }: { path: string; tags: string[]; onSaved: () => void }) {
  const [text, setText] = useState(tags.join(', '));
  const [visibility, setVisibility] = useState<Visibility>('private');
  const mutation = useAccountMutation();
  const values = [...new Set(text.split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
  const valid = values.length <= 10 && values.every(value => value.length <= 32 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value));
  return <View style={{ gap: 10 }}>
    <Field label="Your tags (comma separated)" value={text} onChangeText={setText} editable={!mutation.locked} />
    <T variant="small" muted>Up to 10 tags, using lowercase letters, numbers and hyphens. Saving replaces your tags and applies the selected visibility to them.</T>
    <VisibilityPicker value={visibility} onChange={setVisibility} locked={mutation.locked} />
    {mutation.error && <T accessibilityRole="alert">{mutation.error}</T>}
    <Button label={mutation.locked ? 'Retry tags' : 'Save tags'} disabled={!valid} loading={mutation.busy} onPress={async () => { await mutation.run(`${path}/tags`, 'PUT', { tags: values, visibility }); onSaved(); }} />
  </View>;
}
function CorrectionEditor({ path }: { path: string }) {
  const [field, setField] = useState<PlaceSuggestionCreate['field']>('name');
  const [text, setText] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [closed, setClosed] = useState(true);
  const [sent, setSent] = useState(false);
  const mutation = useAccountMutation();
  const valid = field === 'closed' || (field === 'coords' ? !!lat.trim() && !!lng.trim() && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180
    : field === 'website' ? !text.trim() || !!safeWebUrl(text) : !!text.trim());
  return <View style={{ gap: 10 }}>
    <T muted>Submit a correction for review. It will not immediately change the destination.</T>
    <ChipRow>{(['name', 'hours', 'website', 'coords', 'closed'] as const).map(value => <Chip key={value} label={value} selected={field === value} onPress={mutation.locked ? undefined : () => { setField(value); setText(''); setSent(false); }} />)}</ChipRow>
    {field === 'coords' ? <><Field label="Correct latitude" value={lat} onChangeText={setLat} editable={!mutation.locked} /><Field label="Correct longitude" value={lng} onChangeText={setLng} editable={!mutation.locked} /></>
      : field === 'closed' ? <Chip label={closed ? 'Permanently closed' : 'Not permanently closed'} selected={closed} onPress={mutation.locked ? undefined : () => setClosed(value => !value)} />
      : <Field label={field === 'website' ? 'Website URL (blank to remove)' : `Correct ${field}`} value={text} onChangeText={setText} editable={!mutation.locked} maxLength={field === 'name' ? 200 : 1000} />}
    {mutation.error && <T accessibilityRole="alert">{mutation.error}</T>}
    {sent && <T>Correction submitted for review.</T>}
    <Button label={mutation.locked ? 'Retry correction' : 'Submit correction'} loading={mutation.busy} disabled={!valid || sent} onPress={async () => {
      const requestId = randomUUID();
      const input: PlaceSuggestionCreate = field === 'coords' ? { requestId, field, value: { lat: Number(lat), lng: Number(lng) } }
        : field === 'closed' ? { requestId, field, value: closed }
        : field === 'hours' ? { requestId, field, value: { text: text.trim() } }
        : field === 'website' ? { requestId, field, value: text.trim() || null } : { requestId, field, value: text.trim() };
      await mutation.run(`${path}/suggestions`, 'POST', input); setSent(true);
    }} />
  </View>;
}
export function AccountPlaceDetail({ placeId }: { placeId: string }) {
  const { state, commit, mergePlaces } = useApp();
  const [slug] = useState(() => placeById(placeId)?.slug);
  const path = slug ? placePath(slug) : undefined;
  const resource = useAccountResource<PlaceDetailDto>(path);
  const detail = resource.data;
  const place = detail ? mapPlace(detail) : placeById(placeId);
  const [editingNote, setEditingNote] = useState<string>();
  useEffect(() => { if (detail) mergePlaces([detail]); }, [detail, mergePlaces]);
  if (!path) return <Screen><Header title="Destination unavailable" back /><T>Refresh the catalog or search for this destination again.</T><Button label="Search" onPress={() => router.push('/search')} /></Screen>;
  return <Screen><Header title={place?.name ?? 'Destination'} back />
    <ResourceStatus {...resource} />
    {detail && <>
      <T muted>{[detail.city, detail.region, detail.country].filter(Boolean).join(' · ') || 'Locality unknown'}</T>
      <T>{detail.description || 'No description documented.'}</T>
      <T variant="small" muted>Source: {detail.source ?? 'unknown'} · Timezone: {detail.timezone ?? 'unknown'} · Visibility: {detail.visibility ?? 'unknown'}</T>
      <SourceLink url={detail.website} label="Official website" />
      <Button label="Capture a visit" onPress={() => router.push({ pathname: '/capture', params: { placeId } })} />
      <Button label="Add to a plan" variant="outline" onPress={() => router.push({ pathname: '/planner', params: { placeIds: placeId } })} />
      <Button label={state.favorites.includes(placeId) ? 'Remove favorite' : 'Favorite place'} variant="outline" onPress={() => commit({ type: 'FAVORITE', placeId })} />
      <SectionHeading title="Save to a list" />
      {state.wishlists.map(list => <Button key={list.id} variant="outline" label={`${list.entries.some(entry => entry.placeId === placeId && entry.saverIds.includes('you')) ? 'Unsave from' : 'Save to'} ${list.title}`} onPress={() => commit({ type: 'SAVE_PLACE', placeId, wishlistId: list.id })} />)}
      {!state.wishlists.length && <T muted>Create a wishlist in Friends to save this place.</T>}
      <Button label="Create or manage shared lists" variant="ghost" onPress={() => router.push('/friends')} />
      <SectionHeading title="Your personal appeal" /><T>{appealFor(mapPlace(detail), state).explanation}</T>
      <SectionHeading title="Discovery frequency" /><T>{frequencyLabel(detail.metrics)}</T>
      {detail.metrics && <T>{detail.metrics.collectors} collectors · {detail.metrics.editions} editions · {detail.metrics.saves} saves</T>}
      {detail.metrics && <><T variant="small" muted>{detail.metrics.frequency.visitors90d} collectors visited in the 90-day window; {detail.metrics.frequency.cityVisitors90d} active city collectors. Minimum cohort: {detail.metrics.frequency.minimumCohort}. {detail.metrics.frequency.city ?? 'City unknown'}, {detail.metrics.frequency.country ?? 'country unknown'}.</T><T variant="small" muted>Souvenir activity · {detail.metrics.sampleStatus} · computed {detail.metrics.computedAt}</T></>}
      <SectionHeading title="Friend activity" /><T>{detail.social.friendsBeen} friends been · {detail.social.friendsSaved} friends saved</T>
      <SectionHeading title="Sentiment" /><T>{detail.metrics?.recommendRate == null ? 'Not enough recommendations' : `${Math.round(detail.metrics.recommendRate * 100)}% recommend · ${detail.metrics.sentiment.status}`}</T>
      <SectionHeading title="Documented availability" />
      <T>{detail.availability.status === 'unknown' ? 'Hours unknown' : `${detail.availability.status === 'stale' ? 'Stale hours — verify before visiting: ' : ''}${detail.availability.openingHours ?? 'Hours unknown'}`}</T>
      <T variant="small" muted>{detail.availability.timezone ?? 'Timezone unknown'}{detail.availability.fetchedAt ? ` · fetched ${detail.availability.fetchedAt}` : ''}. No live open/closed claim. Price and visit duration are unknown.</T>
      <SectionHeading title="Gallery" />
      {availableImages(detail.images).map(image => <View key={image.id} style={{ gap: 4, marginBottom: 16 }}>
        <Image source={{ uri: image.url }} cachePolicy="none" style={{ height: 240, borderRadius: 12 }} contentFit="cover" accessibilityLabel={`Destination image by ${image.attribution}`} />
        <T variant="small">{image.attribution} · {image.provider} · {image.license}</T>
        <SourceLink url={image.sourcePageUrl} label="Image source and attribution" /><SourceLink url={image.licenseUrl} label="Image license" />
      </View>)}
      {!availableImages(detail.images).length && <T muted>No licensed gallery images available. Your Capture photos remain private.</T>}
      <SectionHeading title="Source status" />
      {detail.sources.map(source => <View key={source.id} style={{ gap: 4 }}>
        <T>{source.provider} · {source.status}</T><T variant="small" muted>{source.attribution ?? 'Attribution unavailable'} · {source.license ?? 'License unspecified'} · fetched {source.fetchedAt}{source.expiresAt ? ` · expires ${source.expiresAt}` : ''}</T>
        <SourceLink url={source.sourceUrl} label="Open source" /><SourceLink url={source.licenseUrl} label="Source license" />
      </View>)}
      {!detail.sources.length && <T muted>No provider source records available.</T>}
      <SectionHeading title="Visible notes" />
      {detail.notes.filter(note => !detail.myNotes.some(mine => mine.id === note.id)).map(note => <View key={note.id} style={{ gap: 5, paddingVertical: 10 }}><T variant="label">{note.kind} · {note.visibility}</T><T>{note.body}</T><T variant="small" muted>{note.createdAt}</T></View>)}
      {!detail.notes.filter(note => !detail.myNotes.some(mine => mine.id === note.id)).length && <T muted>No shared notes visible to you.</T>}
      <SectionHeading title="Your notes" />
      {detail.myNotes.map(note => <View key={note.id}><T>{note.body}</T><T variant="small" muted>{note.kind} · {note.visibility}</T><Button variant="ghost" label={editingNote === note.id ? 'Close editor' : 'Edit or delete'} onPress={() => setEditingNote(editingNote === note.id ? undefined : note.id)} />{editingNote === note.id && <NoteEditor path={path} note={note} onSaved={() => { setEditingNote(undefined); resource.reload(); }} />}</View>)}
      <NoteEditor path={path} onSaved={resource.reload} />
      <SectionHeading title="Tags" /><T>{detail.tags.join(' · ') || 'No shared tags visible.'}</T>
      <TagEditor path={path} tags={detail.myTags} onSaved={resource.reload} />
      <SectionHeading title="Suggest a correction" /><CorrectionEditor path={path} />
    </>}
  </Screen>;
}
