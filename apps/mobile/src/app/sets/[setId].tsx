import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '@/state/AppProvider';
import { collectedPlaceIds, latestEdition, setProgress, visitDate } from '@/state/selectors';
import { downtownSet, placeById } from '@/fixtures/catalog';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { Button, EmptyState, Header, Icon, Screen, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
export default function SetDetail() {
  const { setId } = useLocalSearchParams<{ setId?: string }>(); const { state, commit } = useApp(); const count = setProgress(state); const owned = collectedPlaceIds(state); const saved = state.wishlists.find(list => list.id === 'personal')?.entries.filter(entry => entry.saverIds.includes('you')).map(entry => entry.placeId) ?? [];
  const [completion, setCompletion] = useState(count === downtownSet.placeIds.length);
  if (setId !== downtownSet.id) return <Screen><Header title="Set unavailable" back /><EmptyState title="We couldn't find this set" message="It may no longer be part of this demo." action="Back to collection" onPress={() => router.replace('/collection')} /></Screen>;
  const missing = downtownSet.placeIds.filter(id => !owned.includes(id));
  return <Screen><Header back title={downtownSet.title} subtitle="Los Angeles · 3 places" /><PlacePhoto placeId="la-central-library" style={{ height: 220 }} />
    <View style={{ paddingVertical: 22, gap: 9 }}><T variant="heading">{count} of {downtownSet.placeIds.length} places collected</T><View style={styles.track}><View style={[styles.fill, { width: `${count / downtownSet.placeIds.length * 100}%` }]} /></View><T muted>{count === 3 ? 'Set completed. Your Downtown Firsts badge is unlocked.' : downtownSet.description}</T></View>
    <View style={{ gap: 3 }}>{downtownSet.placeIds.map(id => { const place = placeById(id)!; const edition = latestEdition(state, id); return <View key={id}>{edition ? <PlaceRow place={place} subtitle={`${visitDate(edition.visitedAt)} · Edition ${String(edition.sequence).padStart(2, '0')}`} trailing={<Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/edition/[editionId]', params: { editionId: edition.id } })} style={styles.inline}><Icon name="check" size={18} /><T variant="small" color={colors.brand}>Edition</T></Pressable>} /> : <PlaceRow place={place} subtitle="Not collected yet" trailing={<View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => { void commit({ type: 'SAVE_PLACE', placeId: id, wishlistId: 'personal' }).catch(() => undefined); }} style={styles.inline}><Icon name="bookmark" size={17} filled={saved.includes(id)} /><T variant="small" color={colors.brand}>{saved.includes(id) ? 'Unsave' : 'Save'}</T></Pressable><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/planner', params: { placeIds: id } })} style={styles.inline}><T variant="small" color={colors.brand}>Plan a visit</T></Pressable></View>} />}</View>; })}</View>
    {missing.length > 0 && <Button label={`Plan remaining ${missing.length} ${missing.length === 1 ? 'place' : 'places'}`} icon="sparkles" onPress={() => router.push({ pathname: '/planner', params: { placeIds: missing.join(',') } })} style={{ marginTop: 22 }} />}
    {count === 3 && <Button label="View your collection" variant="outline" onPress={() => router.push('/collection')} style={{ marginTop: 22 }} />}
    <Sheet visible={completion} onClose={() => setCompletion(false)} title="Downtown Firsts complete"><View style={styles.badge}><Icon name="building" size={42} /><T variant="title" color={colors.brand}>Downtown Firsts</T><T muted style={{ textAlign: 'center' }}>Three places, collected as one Los Angeles chapter.</T></View><Button label="Keep exploring" onPress={() => setCompletion(false)} /></Sheet>
  </Screen>;
}
const styles = StyleSheet.create({ track: { height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.brand }, inline: { minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }, actions: { alignItems: 'flex-end' }, badge: { alignItems: 'center', paddingVertical: 18, gap: 10, backgroundColor: colors.brandSoft, borderRadius: 16 } });
