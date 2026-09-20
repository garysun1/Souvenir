import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, Button, DemoLabel, EmptyState, Header, Screen, SectionHeading, T, Tabs } from '@/components/ui';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { colors } from '@/design/tokens';
import { friendSummary, matchingEditions, wishlistPlannerParams } from '@/domain/social';
import { categoryLabels, placeById, users } from '@/fixtures/catalog';
import { openOuting, PersonalEditionTile, SocialUnavailable, styles, WishlistCard } from '@/features/social/components';
import { useApp } from '@/state/AppProvider';
import { visitDate } from '@/state/selectors';

const bios: Record<string, string> = {
  maya: 'Art afternoons, garden detours, and one more gallery.',
  jordan: 'Taking the scenic route through Los Angeles.',
  sam: 'A soft spot for old buildings and new ideas.',
};

export default function FriendProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { state } = useApp();
  const [tab, setTab] = useState<'collection' | 'saved'>('collection');
  const user = users.find(person => person.id === userId && person.id !== 'you');
  if (!user) return <SocialUnavailable title="This friend is unavailable" message="This installation includes three fictional friends: Maya, Jordan, and Sam. Choose one from your local circle." />;
  const summary = friendSummary(state, user.id);
  const lists = state.wishlists.filter(list => list.memberIds.includes('you') && list.memberIds.includes(user.id));
  const outings = state.outings.filter(outing => outing.participantIds.includes('you') && outing.participantIds.includes(user.id) && state.plans.some(plan => plan.id === outing.planId));
  const groups = outings.flatMap(outing => outing.placeIds.map(placeId => ({ outing, placeId, members: matchingEditions(state, outing.id, placeId) })))
    .filter(group => group.members.some(member => (member.ownerId === 'you' || member.ownerId === user.id) && member.edition));
  const displayed = tab === 'collection' ? summary.placeIds : summary.savedIds;

  return <Screen>
    <Header back subtitle="Your local circle" />
    <View style={{ alignItems: 'center', gap: 10, paddingBottom: 20 }}>
      <Avatar userId={user.id} size={86} />
      <T variant="title">{user.name}</T>
      <T muted style={{ textAlign: 'center', maxWidth: 285 }}>{bios[user.id]}</T>
      <DemoLabel label="Fictional friend · Sample profile" />
      <T variant="small" color={colors.brand}>{user.tastes.map(taste => categoryLabels[taste]).join(' · ')}</T>
    </View>
    <View style={{ flexDirection: 'row', paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider }}>
      {[{ label: 'Places', value: summary.placeIds.length }, { label: 'Editions', value: summary.editions.length }, { label: 'Shared saves', value: summary.savedIds.length }].map(stat => <View key={stat.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}><T variant="heading">{stat.value}</T><T variant="small" muted>{stat.label}</T></View>)}
    </View>
    <T variant="small" muted style={{ marginTop: 10, marginBottom: 20 }}>Counts come from sample public visits and saves visible in this installation, not a real account.</T>
    <Button label={`Plan with ${user.name}`} icon="people" variant="outline" onPress={() => router.push({ pathname: '/planner', params: lists[0] ? wishlistPlannerParams(lists[0]) : { participantIds: `you,${user.id}` } })} />
    <View style={{ marginTop: 20 }}><Tabs underline value={tab} onChange={setTab} options={[{ value: 'collection', label: 'Collection' }, { value: 'saved', label: 'Saved places' }]} /></View>
    {displayed.length ? displayed.map(placeId => {
      const place = placeById(placeId);
      if (!place) return null;
      const edition = summary.editions.find(item => item.placeId === placeId);
      return <View key={placeId}>
        <PlaceRow place={place} subtitle={tab === 'collection' && edition ? `Edition ${String(edition.sequence).padStart(2, '0')} · ${visitDate(edition.visitedAt)}` : `${user.name} saved this to a shared list`} />
        {tab === 'collection' && !!edition?.moment && <T variant="small" muted style={{ paddingTop: 8, paddingBottom: 14 }}>“{edition.moment}”</T>}
      </View>;
    }) : <EmptyState title={tab === 'collection' ? 'No public visits yet' : 'No shared saves yet'} message={`There are no ${tab === 'collection' ? 'visits' : 'saves'} from ${user.name} visible here. You can still make a plan together.`} action={`Plan with ${user.name}`} onPress={() => router.push({ pathname: '/planner', params: { participantIds: `you,${user.id}` } })} />}

    <SectionHeading title="Lists you share" />
    {lists.length ? lists.map(list => <WishlistCard key={list.id} list={list} />) : <T muted>You do not share a list with {user.name} in this local demo. Planning together does not send an invitation.</T>}
    <SectionHeading title="A day together, two memories" />
    <T muted>Matching editions share a place and outing, never a personal photo or note.</T>
    {groups.length ? groups.map(group => <View key={`${group.outing.id}-${group.placeId}`} style={{ gap: 14, marginTop: 18 }}>
      <View style={styles.row}><View style={styles.flex}><T variant="place">{placeById(group.placeId)?.name}</T><T variant="small" color={colors.brand}>{group.outing.title}</T></View></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{group.members.filter(member => member.ownerId === 'you' || member.ownerId === user.id).map(member => <PersonalEditionTile key={member.ownerId} ownerId={member.ownerId} edition={member.edition} placeId={group.placeId} />)}</View>
      <Button label="Open shared outing" variant="ghost" onPress={() => openOuting(group.outing.id)} />
    </View>) : <View style={[styles.quietCard, { marginTop: 14 }]}><T variant="place">The same afternoon, your own point of view.</T><T muted>Accept a shared plan and capture a stop. Each friend must confirm a separate visit before their matching edition appears.</T><Button label={`Plan with ${user.name}`} onPress={() => router.push({ pathname: '/planner', params: lists[0] ? wishlistPlannerParams(lists[0]) : { participantIds: `you,${user.id}` } })} /></View>}
  </Screen>;
}
