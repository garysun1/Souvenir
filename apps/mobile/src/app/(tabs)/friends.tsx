import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, DemoLabel, EmptyState, Header, IconButton, Screen, SectionHeading, Sheet, T, Tabs } from '@/components/ui';
import { socialActivity, wishlistPlannerParams } from '@/domain/social';
import { useApp } from '@/state/AppProvider';
import { ActivityCard, FriendStrip, openFriend, OutingRow, styles, WishlistCard } from '@/features/social/components';
import { AccountFriends } from '@/features/social/AccountFriends';

export default function Friends() {
  const { state } = useApp();
  const [tab, setTab] = useState<'activity' | 'lists'>('activity');
  const [connectionPreview, setConnectionPreview] = useState(false);
  const activity = socialActivity(state);
  const lists = state.wishlists.filter(list => list.memberIds.includes('you') && list.memberIds.length > 1);
  const outings = state.outings.filter(outing => outing.participantIds.includes('you') && outing.participantIds.length > 1 && state.plans.some(plan => plan.id === outing.planId));
  const shared = state.wishlists.find(list => list.id === 'saturday-maya');
  const planTogether = () => router.push({ pathname: '/planner', params: shared ? wishlistPlannerParams(shared) : { participantIds: 'you,maya' } });
  if (state.mode === 'account') return <AccountFriends />;

  return <Screen>
    <Header title="Friends" subtitle="Good places are better together." right={<IconButton name="people" label="Preview friend connection" onPress={() => setConnectionPreview(true)} />} />
    <DemoLabel label={state.preferences.offline ? 'Fictional friends · Available offline' : 'Your local circle · Fictional friends'} />
    <FriendStrip />
    <Tabs underline value={tab} onChange={setTab} options={[{ value: 'activity', label: 'Activity' }, { value: 'lists', label: 'Shared lists' }]} />
    {tab === 'activity' ? <>
      {shared && <View style={[styles.callout, { marginBottom: 22 }]}>
        <T variant="place">Make a little time for each other.</T>
        <T variant="small" muted>Start with your saved places. Choose a time together in the sample planner.</T>
        <Button label="Plan together" icon="arrow" variant="outline" onPress={planTogether} />
      </View>}
      <T variant="small" muted style={{ marginBottom: 12 }}>A mix of fictional sample visits and your saved activity. Imported memories stay out of this feed.</T>
      {activity.length ? activity.map(item => <ActivityCard key={item.id} activity={item} state={state} />) : <EmptyState title="A quiet little feed" message="New captures and accepted shared plans will appear here. No imported memories are published automatically." action="Plan with a friend" onPress={planTogether} />}
    </> : <>
      {lists.length ? lists.map(list => <WishlistCard key={list.id} list={list} />) : <EmptyState title="A fresh list of possibilities" message="Your friends’ sample profiles are still here. Start a shared plan to find somewhere you’ll both enjoy." action="Plan together" onPress={planTogether} />}
      <SectionHeading title="Your outings" action="All plans" onPress={() => router.push('/plans')} />
      {outings.length ? outings.map(outing => <OutingRow key={outing.id} outing={outing} state={state} />) : <View style={styles.quietCard}>
        <T variant="place">Nothing on the calendar. Yet.</T>
        <T muted>Accept a shared plan and its timeline will live here, ready for your separate memories.</T>
        <Button label="Plan an afternoon together" icon="plus" onPress={planTogether} />
      </View>}
    </>}
    <Button label="Preview friend connection" variant="ghost" icon="people" onPress={() => setConnectionPreview(true)} />
    <Sheet visible={connectionPreview} onClose={() => setConnectionPreview(false)} title="A little circle of friends">
      <DemoLabel label="Connection concept · No Meta account access" />
      <T>Maya, Jordan, and Sam are fictional, already-loaded sample profiles. A future connection flow could help you find friends; this prototype does not read contacts, access Meta’s friend graph, or send requests.</T>
      <FriendStrip onSelect={userId => { setConnectionPreview(false); openFriend(userId); }} />
      <Button label="Explore Maya’s sample profile" onPress={() => { setConnectionPreview(false); openFriend('maya'); }} />
      <Button label="Not now" variant="ghost" onPress={() => setConnectionPreview(false)} />
    </Sheet>
  </Screen>;
}
