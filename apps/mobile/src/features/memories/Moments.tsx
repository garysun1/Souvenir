import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import type {
  InvitationRespond, MemoryMomentCreate, MemoryMomentDto, MemoryMomentPatch, MomentTagCreate, MomentTagDto,
} from '../../../../../shared/memories-contract';
import { Button, Chip, Field, SectionHeading, T } from '@/components/ui';
import { placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { momentPath } from '@/lib/memoriesApi';
import { useMemoryActions, useMemoryDraft, useMemoryPage, useMemoryResource } from '@/lib/useMemories';
import { ResourceStatus } from '@/features/discovery/AccountPlaceDetail';
import { ActionStatus, AlbumChoices, Card, Choices, FriendChoices, MemoryPhoto, PageButtons, StopEditor } from './MemoryUi';

export function ShareMoment({ editionId, albumId, onSaved }: { editionId?: string; albumId?: string; onSaved?: () => void }) {
  const { state } = useApp();
  const draft = useMemoryDraft(`share-edition:${editionId ?? 'choose'}:${albumId ?? 'choose'}`, {
    editionId: editionId ?? '', albumId: albumId ?? null as string | null, friendIds: [] as string[], note: '',
  });
  const action = useMemoryActions(`share-edition:${editionId ?? 'choose'}:${albumId ?? 'choose'}`, () => onSaved?.());
  const [consent, setConsent] = useState(false);
  const create = async (retry = false) => {
    const moment = await action.run<MemoryMomentDto>(retry ? undefined : { label: 'create explicit memory moment', path: '/api/moments', method: 'POST', input: {
      requestId: randomUUID(), source: { kind: 'edition', id: draft.value.editionId },
      target: draft.value.albumId ? { kind: 'album', albumId: draft.value.albumId, confirmShare: true } : { kind: 'private' },
      note: draft.value.note.trim() || null,
    } satisfies MemoryMomentCreate });
    router.push({ pathname: '/moment/[momentId]', params: { momentId: moment.id, friends: draft.value.friendIds.join(',') } });
  };
  const locked = action.locked || !draft.ready;
  return <Card><T variant="heading">Share a moment explicitly</T>
    <T muted>Your private companion notes and capture text are never copied. Write a separate note below. Creating a moment does not create anyone else’s visit.</T>
    {!editionId && <Choices>{state.editions.map(edition => <Chip key={edition.id} label={`${placeById(edition.placeId)?.name ?? 'Visit'} · ${edition.visitedAt.slice(0, 10)}`} selected={draft.value.editionId === edition.id} onPress={locked ? undefined : () => draft.save({ ...draft.value, editionId: edition.id })} />)}</Choices>}
    {!state.editions.length && <Button label="Capture your first visit" variant="outline" onPress={() => router.push('/capture')} />}
    <SectionHeading title="Moment destination" />
    <AlbumChoices selected={draft.value.albumId} onChange={id => { setConsent(false); draft.save({ ...draft.value, albumId: id }); }} disabled={locked} />
    <Field label="Separate moment note (visible to anyone you grant moment access)" value={draft.value.note} maxLength={2000} editable={!locked} multiline onChangeText={note => draft.save({ ...draft.value, note })} />
    <SectionHeading title="People to tag next" />
    <T muted>Choose friends here, then confirm each tag on the moment. Tags grant access to this moment’s photo and details, never its album or source edition.</T>
    <FriendChoices selected={draft.value.friendIds} onChange={friendIds => draft.save({ ...draft.value, friendIds })} disabled={locked} />
    {draft.value.albumId && <Chip label="I approve sharing this moment, photo and historical stop with accepted album members" selected={consent} onPress={locked ? undefined : () => setConsent(value => !value)} />}
    <Button label={draft.value.albumId ? 'Contribute moment, then review tags' : 'Keep private moment, then review tags'} disabled={locked || !draft.value.editionId || (!!draft.value.albumId && !consent)} onPress={() => create()} />
    {action.error && <T accessibilityRole="alert">{action.error}</T>}{action.pending && <Button label="Retry creating moment" loading={action.busy} onPress={() => create(true)} />}
    {draft.error && <T accessibilityRole="alert">{draft.error}</T>}
  </Card>;
}
export function MomentDetail({ momentId, initialFriends = [] }: { momentId: string; initialFriends?: string[] }) {
  const moment = useMemoryResource<MemoryMomentDto>(momentPath(momentId));
  return <><ResourceStatus {...moment} />{moment.data && !moment.error && <MomentContent moment={moment.data} initialFriends={initialFriends} reload={moment.reload} />}</>;
}
function MomentContent({ moment, initialFriends, reload }: { moment: MemoryMomentDto; initialFriends: string[]; reload: () => void }) {
  const { userId } = useApp();
  const tags = useMemoryPage<MomentTagDto>(`${momentPath(moment.id)}/tags`);
  const action = useMemoryActions(`moment:${moment.id}`, () => { reload(); tags.reload(); });
  const selection = useMemoryDraft(`tags:${moment.id}`, { friendIds: initialFriends });
  const owner = moment.authorId === userId;
  const [remove, setRemove] = useState(false);
  const [consent, setConsent] = useState(false);
  const locked = action.locked || !selection.ready;
  return <>
    <T variant="small" muted>Contributed by {owner ? 'you' : moment.authorId}</T>
    <T>{moment.confirmedStop ? `${placeById(moment.confirmedStop.placeId)?.name ?? moment.confirmedStop.placeId} · ${moment.confirmedStop.capturedAt} · ${moment.confirmedStop.timezone}` : 'Date or place unresolved'}</T>
    <MemoryPhoto path={`${momentPath(moment.id)}/photo`} />
    {moment.note && <T>{moment.note}</T>}
    <T variant="small" muted>{moment.albumId ? 'Shared through an album; tags are separate.' : 'No album association.'} A tag does not create a visit in your collection.</T>
    {owner && <>
      <MomentEdit key={moment.version} moment={moment} action={action} />
      <SectionHeading title="Tag accepted friends" />
      <FriendChoices selected={selection.value.friendIds} onChange={friendIds => { setConsent(false); selection.save({ friendIds }); }} disabled={locked} />
      <Chip label="I approve granting these friends access to this moment, photo, note and historical stop" selected={consent} onPress={locked ? undefined : () => setConsent(value => !value)} />
      <T muted>Confirm one invitation at a time. Pending recipients can already view this moment to review the invitation. No album access or automatic visit is granted.</T>
      {selection.value.friendIds.map(id => <Button key={id} label={`Send explicit tag to ${id}`} disabled={locked || !consent} onPress={async () => {
        await action.run({ label: 'send explicit person tag', path: `${momentPath(moment.id)}/tags`, method: 'POST', input: { requestId: randomUUID(), userId: id, confirmShare: true } satisfies MomentTagCreate });
        selection.save({ friendIds: selection.value.friendIds.filter(value => value !== id) });
      }} />)}
      {selection.error && <T accessibilityRole="alert">{selection.error}</T>}
      <Button label={remove ? 'Keep moment' : 'Withdraw this moment'} variant="ghost" disabled={locked} onPress={() => setRemove(value => !value)} />
      {remove && <Card><T>Withdrawal revokes future access to this moment. Independent private source visits remain.</T><Button label="Confirm withdraw moment" disabled={locked} onPress={async () => {
        await action.run({ label: 'withdraw memory moment', path: momentPath(moment.id), method: 'DELETE', input: { expectedVersion: moment.version } }); router.replace('/albums');
      }} /></Card>}
    </>}
    <SectionHeading title="Person tags" /><ResourceStatus {...tags} />
    {tags.data?.items.map(tag => <Card key={tag.id}><T>{tag.userId === userId ? 'You' : tag.userId} · {tag.state}</T>
      {tag.state === 'pending' && tag.userId === userId && <Choices>
        <Button label="Accept tag (no visit created)" disabled={locked} onPress={() => respond('accepted', tag)} />
        <Button label="Decline tag and revoke tag access" variant="outline" disabled={locked} onPress={() => respond('declined', tag)} />
      </Choices>}
      {['accepted', 'pending'].includes(tag.state) && (owner || tag.userId === userId) && <Button label="Remove tag and revoke tag access" variant="ghost" disabled={locked} onPress={() => respond('removed', tag)} />}
    </Card>)}<PageButtons page={tags} /><ActionStatus action={action} />
  </>;
  function respond(state: InvitationRespond['state'], tag: MomentTagDto) {
    return action.run({ label: `${state} person tag`, path: `${momentPath(moment.id)}/tags/${tag.id}`, method: 'PATCH', input: { expectedVersion: tag.version, state } satisfies InvitationRespond });
  }
}
function MomentEdit({ moment, action }: { moment: MemoryMomentDto; action: ReturnType<typeof useMemoryActions> }) {
  const draft = useMemoryDraft(`moment-edit:${moment.id}:${moment.version}`, { note: moment.note ?? '', groupKey: moment.groupKey ?? '' });
  const locked = action.locked || !draft.ready;
  const patch = (value: Omit<MemoryMomentPatch, 'expectedVersion'>) => action.run({ label: 'edit moment', path: momentPath(moment.id), method: 'PATCH', input: { expectedVersion: moment.version, ...value } satisfies MemoryMomentPatch });
  return <Card><T variant="place">Edit your contribution</T>
    <Field label="Moment note (visible to granted recipients)" value={draft.value.note} maxLength={2000} multiline editable={!locked} onChangeText={note => draft.save({ ...draft.value, note })} />
    <Field label="Grouping key" value={draft.value.groupKey} maxLength={80} editable={!locked} onChangeText={groupKey => draft.save({ ...draft.value, groupKey })} />
    <Button label="Save moment details" disabled={locked} onPress={() => patch({ note: draft.value.note.trim() || null, groupKey: draft.value.groupKey.trim() || null })} />
    {moment.source.kind === 'import_item' && <StopEditor scope={`moment:${moment.id}:${moment.version}`} value={moment.confirmedStop} disabled={locked} onSave={confirmedStop => patch({ confirmedStop })} />}
    {draft.error && <T accessibilityRole="alert">{draft.error}</T>}
  </Card>;
}
