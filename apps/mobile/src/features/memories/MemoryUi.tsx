import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ConfirmedMemoryStop, MemoryPhotoDto, TripAlbumDto } from '../../../../../shared/memories-contract';
import type { FriendsDto } from '../../../../../shared/worldwide-contract';
import { Button, Chip, Field, Header, Screen, SectionHeading, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { confirmedStop } from '@/domain/memories';
import { placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { useMemoryActions, useMemoryDraft, useMemoryPage, useMemoryResource } from '@/lib/useMemories';
import { ResourceStatus } from '@/features/discovery/AccountPlaceDetail';
import { PlaceSearchSheet } from '@/features/capture/PlaceSearchSheet';

export function MemoryScreen({ title, children }: { title: string; children: ReactNode }) {
  const { mode, refresh, refreshing } = useApp();
  return <Screen><Header title={title} back right={mode === 'account' ? <Button label="Refresh" variant="ghost" loading={refreshing} onPress={refresh} /> : undefined} />{mode === 'account' ? children : <T>Sign in to use real account memories. Sample data is never imported into an account.</T>}</Screen>;
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginVertical: 8, gap: 12 }}>{children}</View>;
}
export function Choices({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}
export function ActionStatus({ action }: { action: ReturnType<typeof useMemoryActions> }) {
  return <>{action.error && <T accessibilityRole="alert" color={colors.error}>{action.error}</T>}
    {action.pending && <><T muted>Unfinished: {action.pending.label}. Retry sends the original saved request.</T><Button label={`Retry ${action.pending.label}`} loading={action.busy} onPress={() => action.run()} /></>}</>;
}
export function PageButtons({ page }: { page: { cursor?: string; data?: { nextCursor: string | null }; next: () => void; first: () => void } }) {
  return <Choices>{page.cursor && <Button label="First page" variant="ghost" onPress={page.first} />}{page.data?.nextCursor && <Button label="More" variant="outline" onPress={page.next} />}</Choices>;
}
export function MemoryPhoto({ path, label = 'Shared memory photo' }: { path: string; label?: string }) {
  const resource = useMemoryResource<MemoryPhotoDto>(path);
  return <><ResourceStatus {...resource} />{resource.data && !resource.loading && !resource.error &&
    <SignedPhoto key={`${resource.data.url}:${resource.data.expiresAt}`} photo={resource.data} label={label} reload={resource.reload} />}</>;
}
function SignedPhoto({ photo, label, reload }: { photo: MemoryPhotoDto; label: string; reload: () => void }) {
  const [expired, setExpired] = useState(() => !Number.isFinite(Date.parse(photo.expiresAt)) || Date.parse(photo.expiresAt) <= Date.now());
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(photo.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [photo.expiresAt]);
  return expired ? <Button label="Reload photo access" variant="outline" onPress={reload} /> :
    <Image source={{ uri: photo.url }} accessibilityLabel={label} cachePolicy="none" contentFit="contain" style={{ height: 230, borderRadius: 12 }} onError={() => setExpired(true)} />;
}
export function FriendChoices({ selected, onChange, disabled }: { selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const { mode } = useApp();
  const friends = useMemoryResource<FriendsDto>(mode === 'account' ? '/api/friends' : undefined);
  const [query, setQuery] = useState('');
  const accepted = friends.data?.friends.filter(friend => friend.status === 'accepted') ?? [];
  return <><Field label="Search accepted friends" value={query} onChangeText={setQuery} editable={!disabled} /><ResourceStatus {...friends} />
    <Choices>{accepted.filter(friend => `${friend.user.displayName} ${friend.user.handle}`.toLowerCase().includes(query.toLowerCase())).map(friend =>
      <Chip key={friend.user.id} label={`${friend.user.displayName}${selected.includes(friend.user.id) ? ' · remove' : ''}`} selected={selected.includes(friend.user.id)}
        onPress={disabled ? undefined : () => onChange(selected.includes(friend.user.id) ? selected.filter(id => id !== friend.user.id) : [...selected, friend.user.id])} />)}</Choices>
    {!accepted.length && <T muted>No accepted friends yet. Add friends first.</T>}</>;
}
export function AlbumChoices({ selected, onChange, disabled }: { selected: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const { mode } = useApp();
  const albums = useMemoryPage<TripAlbumDto>(mode === 'account' ? '/api/albums' : undefined);
  return <><Choices><Chip label="Private" selected={!selected} onPress={disabled ? undefined : () => onChange(null)} />
    {albums.data?.items.map(album => <Chip key={album.id} label={album.title} selected={selected === album.id} onPress={disabled ? undefined : () => onChange(album.id)} />)}</Choices>
    {selected && !albums.data?.items.some(album => album.id === selected) && <T>Selected album: {selected}</T>}
    <ResourceStatus {...albums} /><PageButtons page={albums} /><Button label="Create or manage albums" variant="ghost" onPress={() => router.push('/albums')} /></>;
}
export function StopEditor({ scope, value, onSave, disabled }: { scope: string; value: ConfirmedMemoryStop | null; onSave: (stop: ConfirmedMemoryStop | null) => Promise<unknown>; disabled?: boolean }) {
  const draft = useMemoryDraft(`stop:${scope}`, { placeId: value?.placeId ?? '', instant: value?.capturedAt ?? '', timezone: value?.timezone ?? '' });
  const { placeId, instant, timezone } = draft.value;
  const locked = disabled || !draft.ready;
  const [search, setSearch] = useState(false);
  const [error, setError] = useState<string>();
  return <View style={{ gap: 10 }}>
    <T muted>Confirm the historical place and instant yourself. Missing metadata stays unresolved. Optional nearby search never confirms an old photo automatically.</T>
    <Button label={placeId ? `Place: ${placeById(placeId)?.name ?? placeId}` : 'Choose historical place'} variant="outline" disabled={locked} onPress={() => setSearch(true)} />
    <PlaceSearchSheet visible={search} onClose={() => setSearch(false)} onChoose={id => draft.save({ ...draft.value, placeId: id, timezone: placeById(id)?.timezone ?? '' })} />
    <Field label="Captured instant (date, time and UTC offset)" value={instant} onChangeText={instant => draft.save({ ...draft.value, instant })} editable={!locked} placeholder="2025-07-20T15:30:00-07:00" autoCapitalize="none" />
    <Field label="Historical timezone (IANA)" value={timezone} onChangeText={timezone => draft.save({ ...draft.value, timezone })} editable={!locked} placeholder="America/Los_Angeles" autoCapitalize="none" />
    {error && <T accessibilityRole="alert">{error}</T>}
    {draft.error && <T accessibilityRole="alert">{draft.error}</T>}
    <Button label="Confirm this stop and date" disabled={locked} onPress={async () => {
      try { setError(undefined); await onSave(confirmedStop(placeId, instant, timezone)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save.'); }
    }} />
    {value && <Button label="Mark place and date unresolved" variant="ghost" disabled={locked} onPress={() => onSave(null)} />}
  </View>;
}
export function MemoryLinks() {
  return <><SectionHeading title="Memories together" /><Choices>
    <Button label="Import memories" variant="outline" onPress={() => router.push('/memories')} />
    <Button label="Albums & moments" variant="outline" onPress={() => router.push('/albums')} />
    <Button label="Invitations" variant="outline" onPress={() => router.push('/memories/invitations')} />
  </Choices></>;
}
