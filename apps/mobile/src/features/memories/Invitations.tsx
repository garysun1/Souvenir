import { router } from 'expo-router';
import type { AlbumInvitationDto, InvitationRespond, MomentTagInvitationDto } from '../../../../../shared/memories-contract';
import { Button, SectionHeading, T } from '@/components/ui';
import { useMemoryActions, useMemoryPage } from '@/lib/useMemories';
import { albumPath, momentPath } from '@/lib/memoriesApi';
import { ResourceStatus } from '@/features/discovery/AccountPlaceDetail';
import { ActionStatus, Card, Choices, PageButtons } from './MemoryUi';

export function Invitations() {
  const albums = useMemoryPage<AlbumInvitationDto>('/api/album-invitations');
  const tags = useMemoryPage<MomentTagInvitationDto>('/api/moment-tag-invitations');
  const action = useMemoryActions('memory-invitations', () => { albums.reload(); tags.reload(); });
  const respond = (path: string, version: number, state: InvitationRespond['state']) => action.run({
    label: `${state} invitation`, path, method: 'PATCH', input: { expectedVersion: version, state } satisfies InvitationRespond,
  });
  return <>
    <T muted>Album membership and person tags are separate permissions. Neither creates a visit for you.</T>
    <SectionHeading title="Album invitations" /><ResourceStatus {...albums} />
    {albums.data?.items.map(({ membership, albumTitle, ownerId }) => <Card key={membership.id}><T variant="heading">{albumTitle}</T><T>Invited by {ownerId} · {membership.state}</T>
      {membership.state === 'pending' && <><T muted>Accepting shares the album’s contributions with you and lets you contribute your own media explicitly.</T><Choices>
        <Button label="Accept album invitation" disabled={action.locked} onPress={() => respond(`${albumPath(membership.albumId)}/members/${membership.id}`, membership.version, 'accepted')} />
        <Button label="Decline album invitation" variant="outline" disabled={action.locked} onPress={() => respond(`${albumPath(membership.albumId)}/members/${membership.id}`, membership.version, 'declined')} />
      </Choices></>}
      {membership.state === 'accepted' && <Button label="Open accepted album" onPress={() => router.push({ pathname: '/albums/[albumId]', params: { albumId: membership.albumId } })} />}
      {['pending', 'accepted'].includes(membership.state) && <Button label="Remove my album association" variant="ghost" disabled={action.locked} onPress={() => respond(`${albumPath(membership.albumId)}/members/${membership.id}`, membership.version, 'removed')} />}
    </Card>)}
    {albums.data && !albums.data.items.length && <T muted>No album invitations.</T>}<PageButtons page={albums} />
    <SectionHeading title="Moment tag invitations" /><ResourceStatus {...tags} />
    {tags.data?.items.map(({ tag, moment }) => <Card key={tag.id}><T>From {tag.senderId} · {tag.state}</T><T>{moment.note ?? 'A shared memory'}</T>
      {['pending', 'accepted'].includes(tag.state) && <Button label="Review this moment and photo" variant="outline" onPress={() => router.push({ pathname: '/moment/[momentId]', params: { momentId: moment.id } })} />}
      {tag.state === 'pending' && <Choices>
        <Button label="Accept tag (no visit created)" disabled={action.locked} onPress={() => respond(`${momentPath(moment.id)}/tags/${tag.id}`, tag.version, 'accepted')} />
        <Button label="Decline and revoke tag access" variant="outline" disabled={action.locked} onPress={() => respond(`${momentPath(moment.id)}/tags/${tag.id}`, tag.version, 'declined')} />
      </Choices>}
      {['pending', 'accepted'].includes(tag.state) && <Button label="Remove tag" variant="ghost" disabled={action.locked} onPress={() => respond(`${momentPath(moment.id)}/tags/${tag.id}`, tag.version, 'removed')} />}
    </Card>)}
    {tags.data && !tags.data.items.length && <T muted>No person tag invitations.</T>}<PageButtons page={tags} />
    <ActionStatus action={action} />
  </>;
}
