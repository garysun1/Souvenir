import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AvatarStack, Button, DemoLabel, EmptyState, Field, Header, IconButton, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { colors } from '@/design/tokens';
import { memberNames, searchSocialPlaces, wishlistOverlap, wishlistPlannerParams } from '@/domain/social';
import { categoryLabels, placeById } from '@/fixtures/catalog';
import { InvitationSheet } from '@/features/social/InvitationSheet';
import { SocialUnavailable, styles } from '@/features/social/components';
import { useApp } from '@/state/AppProvider';
import { visitDate } from '@/state/selectors';

export default function WishlistScreen() {
  const { wishlistId } = useLocalSearchParams<{ wishlistId: string }>();
  const { state, commit, error } = useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const list = state.wishlists.find(item => item.id === wishlistId);
  if (!list || !list.memberIds.includes('you')) return <SocialUnavailable title="This wishlist is unavailable" message="This demo list was not found on your device, or you are not a member. Your other shared places are still here." />;
  const overlap = wishlistOverlap(list);
  const shared = list.memberIds.length > 1;
  const results = searchSocialPlaces(query);
  const plan = () => router.push({ pathname: '/planner', params: wishlistPlannerParams(list) });
  const openCatalog = () => { setQuery(''); setAddOpen(true); };
  const toggleSave = async (placeId: string) => {
    const saved = list.entries.find(entry => entry.placeId === placeId)?.saverIds.includes('you');
    await commit({ type: 'SAVE_PLACE', wishlistId: list.id, placeId });
    setNotice(saved ? `Removed your save for ${placeById(placeId)?.name}. Other members’ saves are unchanged.` : `Saved ${placeById(placeId)?.name} to ${list.title}.`);
  };

  return <Screen>
    <Header back subtitle={shared ? 'A shared wishlist' : 'Your personal wishlist'} right={shared ? <IconButton name="share" label="Preview an invitation" onPress={() => setInviteOpen(true)} /> : undefined} />
    <T variant="title">{list.title}</T>
    <View style={[styles.row, { marginVertical: 14 }]}><AvatarStack ids={list.memberIds} /><T variant="small" muted>{memberNames(list.memberIds)} · {list.entries.length} places</T></View>
    <DemoLabel label={state.preferences.offline ? 'Local demo · Saves work offline' : 'Local demo · Sample costs & hours'} />
    <T variant="small" muted style={{ marginTop: 8 }}>Your own saves are editable. Another person’s save is theirs to keep.</T>

    {shared && (overlap.length ? <View style={[styles.callout, { marginTop: 22 }]}>
      <T variant="heading">{list.memberIds.length === 2 && list.memberIds.includes('maya') ? `You and Maya both saved these ${overlap.length}.` : `${memberNames(list.memberIds)} all saved these ${overlap.length}.`}</T>
      <T variant="small" muted>{overlap.map(id => placeById(id)?.name).join(' · ')}</T>
      <T variant="small" muted>Try {visitDate(state.clock)}. Choose a shared window in the planner; this is not Maya’s real availability.</T>
      <Button label="Plan together" icon="arrow" onPress={plan} />
      <Button label="Pick a time" variant="ghost" icon="clock" onPress={plan} />
    </View> : <View style={[styles.quietCard, { marginTop: 22 }]}>
      <T variant="place">Find something you both like</T>
      <T muted>No common saves yet. Browse the list or add a place; your overlap will update as you save.</T>
      <Button label="Find a place" icon="search" variant="outline" onPress={openCatalog} />
      <Button label="Plan together anyway" variant="ghost" onPress={plan} />
    </View>)}

    <SectionHeading title="Places to make time for" action="Add place" onPress={openCatalog} />
    {!!notice && <T accessibilityLiveRegion="polite" variant="small" color={colors.brand} style={{ marginBottom: 8 }}>{notice}</T>}
    {list.entries.length ? list.entries.map(entry => {
      const place = placeById(entry.placeId);
      if (!place) return <View key={entry.placeId} style={styles.mutedLine}><T variant="place">Place unavailable</T><T muted>This catalog entry is not available. The other saved places are unchanged.</T></View>;
      const yours = entry.saverIds.includes('you');
      const done = entry.completedBy.includes('you');
      return <View key={entry.placeId} style={{ paddingBottom: 14 }}>
        <PlaceRow place={place} subtitle={categoryLabels[place.category]} trailing={<Button label={yours ? 'Saved' : 'Save'} icon={yours ? 'check' : 'bookmark'} variant="outline" style={{ paddingHorizontal: 12 }} onPress={() => toggleSave(place.id)} />} />
        <View style={[styles.row, { paddingTop: 10 }]}><AvatarStack ids={entry.saverIds} /><T variant="small" muted style={styles.flex}>Saved by {memberNames(entry.saverIds)}</T></View>
        {entry.completedBy.length > 0 && <T variant="small" color={colors.brand} style={{ paddingTop: 8 }}>Marked done by {memberNames(entry.completedBy)}</T>}
        {!done && <Button label="Mark done for me" variant="ghost" onPress={async () => {
          await commit({ type: 'COMPLETE_WISHLIST', wishlistId: list.id, placeId: place.id });
          setNotice(`${place.name} marked done for you. This does not create a visit or change anyone else’s status.`);
        }} />}
      </View>;
    }) : <EmptyState title="Room for your next favorite" message="Add a catalog place to start this list. Planning is still available before you save anything." action="Add a place" onPress={openCatalog} icon="bookmark" />}
    <View style={{ gap: 10, marginTop: 18 }}>
      <Button label="Add a place" icon="plus" variant="outline" onPress={openCatalog} />
      <Button label={shared ? 'Plan together' : 'Plan from this list'} icon="arrow" onPress={plan} />
      {shared && <Button label="Preview invitation" variant="ghost" icon="share" onPress={() => setInviteOpen(true)} />}
      <T variant="small" muted>List names and membership are fixed in this prototype. Saves and done markers are stored locally; they are not sent to other devices.</T>
    </View>

    <Sheet title="Add a little possibility" visible={addOpen} onClose={() => setAddOpen(false)}>
      <Field label="Search the catalog" placeholder="A place, neighborhood, or feeling" value={query} onChangeText={setQuery} autoCorrect={false} />
      <T variant="small" muted>{results.length} {results.length === 1 ? 'place' : 'places'} · Sample admission costs</T>
      {!!error && <T accessibilityLiveRegion="polite" color={colors.error}>{error} Your previous saves are unchanged. Tap Save to retry.</T>}
      {!!notice && !error && <T accessibilityLiveRegion="polite" variant="small" color={colors.brand}>{notice}</T>}
      {results.length ? results.map(place => {
        const saved = list.entries.find(entry => entry.placeId === place.id)?.saverIds.includes('you');
        return <PlaceRow key={place.id} place={place} onPress={() => { setAddOpen(false); router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } }); }} trailing={<Button label={saved ? 'Saved' : 'Save'} icon={saved ? 'check' : 'plus'} variant="outline" style={{ paddingHorizontal: 12 }} onPress={() => toggleSave(place.id)} />} />;
      }) : <EmptyState title="No places found" message="Try a neighborhood like Downtown, or a feeling like quiet." action="Clear search" onPress={() => setQuery('')} icon="search" />}
      <Button label="Done" onPress={() => setAddOpen(false)} />
    </Sheet>
    <InvitationSheet list={list} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
  </Screen>;
}
