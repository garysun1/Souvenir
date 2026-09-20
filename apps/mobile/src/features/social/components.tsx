import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { AppState, Edition, Outing, Wishlist } from '@/domain/types';
import { activityDate, memberNames, type SocialActivity, wishlistOverlap } from '@/domain/social';
import { Avatar, AvatarStack, Button, DemoLabel, EmptyState, Header, Icon, Screen, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { colors } from '@/design/tokens';
import { placeById, users } from '@/fixtures/catalog';
import { visitDate } from '@/state/selectors';

export const openFriend = (userId: string) => userId === 'you'
  ? router.push('/profile')
  : router.push({ pathname: '/friend/[userId]', params: { userId } });
export const openWishlist = (wishlistId: string) => router.push({ pathname: '/wishlist/[wishlistId]', params: { wishlistId } });
export const openOuting = (outingId: string) => router.push({ pathname: '/outing/[outingId]', params: { outingId } });

export function SocialUnavailable({ title = 'This page is unavailable', message }: { title?: string; message: string }) {
  return <Screen><Header back title="Friends" /><EmptyState title={title} message={message} icon="people" action="Back to Friends" onPress={() => router.replace('/friends')} /></Screen>;
}

export function FriendStrip({ onSelect = openFriend }: { onSelect?: (userId: string) => void } = {}) {
  return <View style={styles.friendStrip}>{users.filter(user => user.id !== 'you').map(user => (
    <Pressable key={user.id} accessibilityRole="button" accessibilityLabel={`View ${user.name}’s sample profile`} onPress={() => onSelect(user.id)} style={styles.friend}>
      <Avatar userId={user.id} size={54} /><T variant="label">{user.name}</T>
    </Pressable>
  ))}</View>;
}

export function ActivityCard({ activity, state }: { activity: SocialActivity; state: AppState }) {
  if (activity.kind === 'plan') {
    return <View style={styles.activity}>
      <View style={styles.row}><AvatarStack ids={activity.plan.constraints.participantIds} /><View style={styles.flex}><T variant="label">An afternoon to look forward to</T><T variant="small" muted>{activityDate(activity.at)} · Sample plan</T></View></View>
      <T variant="heading">{activity.plan.title}</T>
      <T muted>{activity.plan.stops.map(stop => placeById(stop.placeId)?.name ?? 'Unavailable place').join(' → ')}</T>
      <T variant="small" muted>Accepted locally · No reservations or messages sent</T>
      <Button label="See the outing" variant="outline" icon="arrow" onPress={() => openOuting(activity.outingId)} />
    </View>;
  }
  const { edition, sentiment } = activity;
  const place = placeById(edition.placeId);
  if (!place) return null;
  const name = edition.ownerId === 'you' ? 'You' : users.find(user => user.id === edition.ownerId)?.name;
  const outing = state.outings.find(item => item.id === edition.outingId);
  return <View style={styles.activity}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${name}’s profile`} onPress={() => openFriend(edition.ownerId)} style={[styles.row, { minHeight: 44 }]}>
      <Avatar userId={edition.ownerId} size={38} /><View style={styles.flex}><T variant="label">{name} collected a little memory</T><T variant="small" muted>{activityDate(edition.visitedAt)} · {edition.ownerId === 'you' ? 'Your collection' : 'Fictional friend'}</T></View><Icon name="chevron" size={15} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${place.name}`} onPress={() => router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } })}>
      <PlacePhoto placeId={place.id} uri={edition.photoUri} style={styles.feedPhoto} />
      <View style={styles.photoCaption}><View style={styles.flex}><T variant="place">{place.name}</T><T variant="small" muted>{place.neighborhood}</T></View><Icon name="arrow" size={18} /></View>
    </Pressable>
    {!!edition.moment && <T>“{edition.moment}”</T>}
    <View style={styles.wrap}>
      {sentiment && <View style={[styles.sentiment, { backgroundColor: sentiment === 'recommend' ? '#E4F1E9' : sentiment === 'depends' ? '#FCF3D9' : '#FBE6E6' }]}><T variant="small">{sentiment === 'recommend' ? 'Recommended' : sentiment === 'depends' ? 'It depends' : 'Would skip'}</T></View>}
      {edition.ownerId !== 'you' && <DemoLabel label="Sample photo & moment" small />}
    </View>
    {outing && <Button variant="ghost" icon="people" label={outing.title} onPress={() => openOuting(outing.id)} />}
    {edition.ownerId === 'you' && <Button variant="ghost" label="Open your edition" onPress={() => router.push({ pathname: '/edition/[editionId]', params: { editionId: edition.id } })} />}
  </View>;
}

export function WishlistCard({ list }: { list: Wishlist }) {
  const overlap = wishlistOverlap(list);
  const cover = list.entries.find(entry => placeById(entry.placeId));
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${list.title}, ${list.entries.length} places, ${overlap.length} in common`} onPress={() => openWishlist(list.id)} style={styles.listCard}>
    {cover && <PlacePhoto placeId={cover.placeId} style={{ height: 132 }} />}
    <View style={styles.row}><View style={styles.flex}><T variant="heading">{list.title}</T><T variant="small" muted>{list.entries.length} places · {memberNames(list.memberIds)}</T></View><Icon name="chevron" size={19} /></View>
    <View style={styles.between}><AvatarStack ids={list.memberIds} /><T variant="small" color={colors.brand} style={{ flex: 1, textAlign: 'right' }}>{overlap.length ? `${overlap.length} places in common` : 'Find your next shared favorite'}</T></View>
    <T variant="small" muted>Local list · Saved changes shown here</T>
  </Pressable>;
}

export function OutingRow({ outing, state }: { outing: Outing; state: AppState }) {
  const completed = outing.placeIds.filter(placeId => state.editions.some(edition => edition.ownerId === 'you' && edition.outingId === outing.id && edition.placeId === placeId)).length;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open outing ${outing.title}`} onPress={() => openOuting(outing.id)} style={styles.outingRow}>
    <View style={styles.outingIcon}><Icon name="people" /></View><View style={styles.flex}><T variant="place">{outing.title}</T><T variant="small" muted>{memberNames(outing.participantIds)}</T><T variant="small" color={colors.brand}>{completed} of {outing.placeIds.length} stops in your album</T></View><Icon name="chevron" size={18} />
  </Pressable>;
}

export function PersonalEditionTile({ edition, ownerId, placeId }: { edition?: Edition; ownerId: string; placeId: string }) {
  const name = users.find(user => user.id === ownerId)?.name ?? 'Member';
  return <View style={styles.editionTile}>
    <View style={styles.row}><Avatar userId={ownerId} size={28} /><T variant="label">{name}</T></View>
    {edition ? <>
      <PlacePhoto placeId={placeId} uri={edition.photoUri} style={{ height: 144 }} />
      <T variant="small" color={colors.brand}>Edition {String(edition.sequence).padStart(2, '0')} · {visitDate(edition.visitedAt)}</T>
      <T variant="small">{edition.moment || 'A moment kept, without a note.'}</T>
      {ownerId === 'you' ? <Button variant="ghost" label="View edition" onPress={() => router.push({ pathname: '/edition/[editionId]', params: { editionId: edition.id } })} /> : <DemoLabel label={`${name}’s sample memory`} small />}
    </> : <View style={styles.waiting}><Icon name="clock" /><T variant="small" muted style={{ textAlign: 'center' }}>{ownerId === 'you' ? 'Your visit is not captured yet' : `Waiting for ${name}’s visit`}</T></View>}
  </View>;
}

export const styles = StyleSheet.create({
  flex: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  stack: { gap: 12 }, friendStrip: { flexDirection: 'row', gap: 27, paddingVertical: 22 },
  friend: { alignItems: 'center', gap: 6, minWidth: 62, minHeight: 80 },
  activity: { gap: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingTop: 12, paddingBottom: 25, marginBottom: 16 },
  feedPhoto: { height: 205, borderRadius: 12 }, photoCaption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  sentiment: { alignSelf: 'flex-start', borderRadius: 5, paddingVertical: 4, paddingHorizontal: 8 },
  listCard: { gap: 14, padding: 14, borderWidth: 1, borderColor: colors.divider, borderRadius: 14, marginBottom: 14 },
  callout: { padding: 18, borderRadius: 14, backgroundColor: colors.brandSoft, gap: 12 },
  quietCard: { borderWidth: 1, borderColor: colors.divider, borderRadius: 14, padding: 16, gap: 12 },
  outingRow: { flexDirection: 'row', gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.divider, alignItems: 'center' },
  outingIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  editionTile: { flexGrow: 1, flexBasis: '45%', minWidth: 132, gap: 10, padding: 10, borderWidth: 1, borderColor: colors.divider, borderRadius: 12 },
  waiting: { minHeight: 160, backgroundColor: colors.surface, borderRadius: 8, justifyContent: 'center', alignItems: 'center', padding: 10, gap: 12 },
  mutedLine: { paddingVertical: 14, gap: 6 },
});
