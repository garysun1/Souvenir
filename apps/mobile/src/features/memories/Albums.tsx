import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type {
  AlbumMemberDto, AlbumMemberInvite, InvitationRespond, MemoryMomentDto, TripAlbumCreate, TripAlbumDto, TripAlbumPatch,
} from '../../../../../shared/memories-contract';
import { Button, Field, SectionHeading, T } from '@/components/ui';
import { groupMoments } from '@/domain/memories';
import { placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { albumPath } from '@/lib/memoriesApi';
import { useMemoryActions, useMemoryDraft, useMemoryPage, useMemoryResource } from '@/lib/useMemories';
import { ResourceStatus } from '@/features/discovery/AccountPlaceDetail';
import { ActionStatus, Card, FriendChoices, PageButtons } from './MemoryUi';
import { ShareMoment } from './Moments';

export function Albums() {
  const albums = useMemoryPage<TripAlbumDto>('/api/albums');
  const moments = useMemoryPage<MemoryMomentDto>('/api/moments');
  const action = useMemoryActions('new-album', albums.reload);
  const draft = useMemoryDraft('new-album', { title: '', description: '' });
  const [share, setShare] = useState(false);
  const create = async (retry = false) => {
    const album = await action.run<TripAlbumDto>(retry ? undefined : { label: 'create album', path: '/api/albums', method: 'POST', input: {
      requestId: randomUUID(), title: draft.value.title.trim(), description: draft.value.description.trim() || null,
    } satisfies TripAlbumCreate });
    draft.save({ title: '', description: '' }); router.push({ pathname: '/albums/[albumId]', params: { albumId: album.id } });
  };
  return <>
    <T muted>Albums are shared only with accepted members. Inviting someone requires a separate acceptance; tagging a person never grants album access.</T>
    <Button label="Album and tag invitations" variant="outline" onPress={() => router.push('/memories/invitations')} />
    <SectionHeading title="Your albums" /><ResourceStatus {...albums} />
    {albums.data?.items.map(album => <Card key={album.id}><T variant="heading">{album.title}</T><T muted>{album.role} · {album.description}</T>
      <Button label="Open album" onPress={() => router.push({ pathname: '/albums/[albumId]', params: { albumId: album.id } })} /></Card>)}
    {albums.data && !albums.data.items.length && <T muted>No shared albums yet.</T>}<PageButtons page={albums} />
    <SectionHeading title="Create an album" />
    <Field label="Album title" value={draft.value.title} maxLength={120} editable={draft.ready && !action.locked} onChangeText={title => draft.save({ ...draft.value, title })} />
    <Field label="Album description (visible to members)" value={draft.value.description} maxLength={2000} multiline editable={draft.ready && !action.locked} onChangeText={description => draft.save({ ...draft.value, description })} />
    <Button label="Create album" disabled={!draft.ready || action.locked || !draft.value.title.trim()} onPress={() => create()} />
    {action.error && <T accessibilityRole="alert">{action.error}</T>}{action.pending && <Button label="Resume creating album" loading={action.busy} onPress={() => create(true)} />}
    {draft.error && <T accessibilityRole="alert">{draft.error}</T>}
    <SectionHeading title="Your authored moments" /><ResourceStatus {...moments} />
    <MomentGroups moments={moments.data?.items ?? []} /><PageButtons page={moments} />
    <Button label={share ? 'Close moment creation' : 'Create a moment from a captured visit'} variant="outline" onPress={() => setShare(value => !value)} />
    {share && <ShareMoment onSaved={moments.reload} />}
    <Button label="Import device photos" variant="outline" onPress={() => router.push('/memories')} />
  </>;
}
export function AlbumDetail({ albumId }: { albumId: string }) {
  const album = useMemoryResource<TripAlbumDto>(albumPath(albumId));
  return <><ResourceStatus {...album} />{album.data && !album.error && <AlbumContent album={album.data} reload={album.reload} />}</>;
}
function AlbumContent({ album, reload }: { album: TripAlbumDto; reload: () => void }) {
  const { userId } = useApp();
  const moments = useMemoryPage<MemoryMomentDto>(`${albumPath(album.id)}/moments`);
  const members = useMemoryPage<AlbumMemberDto>(`${albumPath(album.id)}/members`);
  const action = useMemoryActions(`album:${album.id}`, () => { reload(); members.reload(); moments.reload(); });
  const [friends, setFriends] = useState<string[]>([]);
  const [remove, setRemove] = useState(false);
  const [share, setShare] = useState(false);
  return <>
    <T variant="heading">{album.title}</T><T>{album.description}</T><T variant="small" muted>Owner: {album.ownerId} · your role: {album.role}</T>
    {album.role === 'owner' && <AlbumEdit key={album.version} album={album} action={action} />}
    <SectionHeading title="Days, stops and contributions" /><ResourceStatus {...moments} />
    <T muted>Grouping uses each confirmed stop’s local calendar day and place. Unresolved moments remain separate. Contributors retain their own media.</T>
    <MomentGroups moments={moments.data?.items ?? []} /><PageButtons page={moments} />
    <Button label={share ? 'Close contribution' : 'Contribute a captured visit'} variant="outline" onPress={() => setShare(value => !value)} />
    {share && <ShareMoment albumId={album.id} onSaved={moments.reload} />}
    <Button label="Import and contribute device photos" variant="outline" onPress={() => router.push('/memories')} />
    <SectionHeading title="Membership" /><ResourceStatus {...members} />
    {members.data?.items.map(member => <Card key={member.id}><T>{member.userId === userId ? 'You' : member.userId} · {member.state}</T>
      {['pending', 'accepted'].includes(member.state) && (member.userId === userId || album.role === 'owner') && <Button label={member.userId === userId ? 'Leave album and hide my contributions' : 'Remove member and hide their contributions'} variant="outline" disabled={action.locked} onPress={() => action.run({
        label: 'remove album membership', path: `${albumPath(album.id)}/members/${member.id}`, method: 'PATCH',
        input: { expectedVersion: member.version, state: 'removed' } satisfies InvitationRespond,
      })} />}
    </Card>)}<PageButtons page={members} />
    {album.role === 'owner' && <><SectionHeading title="Invite accepted friends" />
      <T muted>An invitation shares the album title and owner. Photos become visible after acceptance.</T>
      <FriendChoices selected={friends} onChange={ids => setFriends(ids.slice(-1))} disabled={action.locked} />
      <Button label="Send album invitation" disabled={action.locked || friends.length !== 1} onPress={async () => {
        await action.run({ label: 'invite album member', path: `${albumPath(album.id)}/members`, method: 'POST', input: { requestId: randomUUID(), userId: friends[0] } satisfies AlbumMemberInvite }); setFriends([]);
      }} />
      <Button label={remove ? 'Keep album' : 'Delete album'} variant="ghost" disabled={action.locked} onPress={() => setRemove(value => !value)} />
      {remove && <Card><T>All moments detach into their authors’ private records. Independent explicit tags remain. Other people’s source media is not deleted.</T>
        <Button label="Confirm delete album" disabled={action.locked} onPress={async () => { await action.run({ label: 'delete album', path: albumPath(album.id), method: 'DELETE', input: { expectedVersion: album.version } }); router.replace('/albums'); }} /></Card>}
    </>}
    <ActionStatus action={action} />
  </>;
}
function AlbumEdit({ album, action }: { album: TripAlbumDto; action: ReturnType<typeof useMemoryActions> }) {
  const draft = useMemoryDraft(`album-edit:${album.id}:${album.version}`, { title: album.title, description: album.description ?? '' });
  return <Card><Field label="Album title" value={draft.value.title} maxLength={120} editable={draft.ready && !action.locked} onChangeText={title => draft.save({ ...draft.value, title })} />
    <Field label="Album description" value={draft.value.description} maxLength={2000} multiline editable={draft.ready && !action.locked} onChangeText={description => draft.save({ ...draft.value, description })} />
    <Button label="Save album details" disabled={!draft.ready || action.locked || !draft.value.title.trim()} onPress={() => action.run({ label: 'edit album', path: albumPath(album.id), method: 'PATCH', input: {
      expectedVersion: album.version, title: draft.value.title.trim(), description: draft.value.description.trim() || null,
    } satisfies TripAlbumPatch })} />{draft.error && <T accessibilityRole="alert">{draft.error}</T>}</Card>;
}
export function MomentGroups({ moments }: { moments: MemoryMomentDto[] }) {
  const { userId } = useApp();
  if (!moments.length) return <T muted>No moments on this page yet.</T>;
  return <>{groupMoments(moments).map(group => {
    const stop = group.items[0].confirmedStop;
    return <Card key={group.key}>
      <T variant="heading">{stop ? new Date(stop.capturedAt).toLocaleDateString(undefined, { timeZone: stop.timezone, year: 'numeric', month: 'long', day: 'numeric' }) : 'Date or place unresolved'}</T>
      {stop && <T variant="place">{placeById(stop.placeId)?.name ?? `Place ${stop.placeId}`}</T>}
      {group.items[0].groupKey && <T muted>Group: {group.items[0].groupKey}</T>}
      {group.items.map(moment => <View key={moment.id} style={{ gap: 8 }}>
        <T variant="small">Contributed by {moment.authorId === userId ? 'you' : moment.authorId}</T>
        {moment.note && <T>{moment.note}</T>}
        <Button label="Open moment" variant="outline" onPress={() => router.push({ pathname: '/moment/[momentId]', params: { momentId: moment.id } })} />
      </View>)}
    </Card>;
  })}</>;
}
