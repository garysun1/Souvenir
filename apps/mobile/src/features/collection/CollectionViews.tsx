import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { AppState, Edition, Place } from '@/domain/types';
import type { CollectionFilters } from '@/domain/collection';
import { editionMonths, matchingEditions, recommendationLabel, wishlistMemberships } from '@/domain/collection';
import { collectedPlaceIds, latestEdition, savedPlaceIds, visitDate } from '@/state/selectors';
import { categoryLabels, placeById } from '@/fixtures/catalog';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { PlaceRow } from '@/components/cards/PlaceRow';
import PlaceMap from '@/components/map/PlaceMap';
import { AvatarStack, Button, EmptyState, Icon, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';

export function BeenList({ state, places, filters }: { state: AppState; places: Place[]; filters: CollectionFilters }) {
  return <View>{places.map(place => {
    const editions = matchingEditions(state, filters).filter(edition => edition.placeId === place.id).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
    const latest = editions[0];
    const rank = state.rankings.find(item => item.placeIds.includes(place.id));
    const ordinal = rank && !rank.provisionalIds.includes(place.id) && !rank.ties.some(pair => pair.includes(place.id)) ? `#${rank.placeIds.indexOf(place.id) + 1}` : '';
    return <PlaceRow key={place.id} place={place} subtitle={`${latest ? visitDate(latest.visitedAt, latest.timezone) : 'Visit date unavailable'} · ${editions.length} ${editions.length === 1 ? 'edition' : 'editions'}\n${recommendationLabel(state, place.id)}`} trailing={<T variant="label" color={colors.brand}>{ordinal}</T>} />;
  })}</View>;
}

type AlbumRow = { id: string; month: string; kind: 'month' } | { id: string; editions: Edition[]; kind: 'editions' } | { id: string; places: Place[]; kind: 'places' };
export function Album({ state, places, allEditions, filters }: { state: AppState; places: Place[]; allEditions: boolean; filters: CollectionFilters }) {
  const width = useWindowDimensions().width;
  const columns = width > 700 ? 3 : 2;
  const cardWidth = Math.max(120, (Math.min(width, 480) - 44 - 12 * (columns - 1)) / columns);
  const rows: AlbumRow[] = [];
  const matching = matchingEditions(state, filters).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
  if (allEditions) {
    for (const group of editionMonths(state, places.map(place => place.id), filters)) {
      rows.push({ id: group.month, month: group.month, kind: 'month' });
      for (let index = 0; index < group.editions.length; index += columns) rows.push({ id: `${group.month}-${index}`, editions: group.editions.slice(index, index + columns), kind: 'editions' });
    }
  } else for (let index = 0; index < places.length; index += columns) rows.push({ id: `places-${index}`, places: places.slice(index, index + columns), kind: 'places' });
  return <FlatList data={rows} keyExtractor={row => row.id} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 32 }} renderItem={({ item }) => {
    if (item.kind === 'month') return <T variant="heading" style={{ marginTop: 10 }}>{new Date(`${item.month}-02T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</T>;
    if (item.kind === 'editions') return <View style={styles.grid}>{item.editions.map(edition => {
      const place = placeById(edition.placeId);
      return place && <Pressable key={edition.id} accessibilityRole="button" accessibilityLabel={`Open ${place.name}, edition ${edition.sequence}`} onPress={() => router.push({ pathname: '/edition/[editionId]', params: { editionId: edition.id } })} style={{ width: cardWidth, gap: 7 }}>
        <PlacePhoto placeId={place.id} uri={edition.photoUri} style={{ width: cardWidth, height: cardWidth * 1.05 }}><View style={styles.badge}><T variant="small" color="#fff">Edition {String(edition.sequence).padStart(2, '0')}</T></View></PlacePhoto>
        <T variant="place">{place.name}</T><T variant="small" muted>{visitDate(edition.visitedAt, edition.timezone)}</T>
        {!!edition.moment && <T variant="small" numberOfLines={3}>{edition.moment}</T>}
        {edition.companions.length > 0 && <T variant="small" muted numberOfLines={2}>With {edition.companions.join(', ')}</T>}
        {edition.outingId && <T variant="small" color={colors.brand}>{state.outings.find(outing => outing.id === edition.outingId)?.title}</T>}
      </Pressable>;
    })}</View>;
    return <View style={styles.grid}>{item.places.map(place => {
      const editions = matching.filter(edition => edition.placeId === place.id); const latest = editions[0];
      return <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={() => latest ? router.push({ pathname: '/edition/[editionId]', params: { editionId: latest.id } }) : router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } })} style={{ width: cardWidth, gap: 7 }}>
        <PlacePhoto placeId={place.id} uri={latest?.photoUri} style={{ width: cardWidth, height: cardWidth * 1.05 }}><View style={styles.badge}><T variant="small" color="#fff">{editions.length ? `${editions.length} ${editions.length === 1 ? 'edition' : 'editions'}` : 'Saved'}</T></View></PlacePhoto>
        <T variant="place">{place.name}</T><T variant="small" muted>{latest ? visitDate(latest.visitedAt, latest.timezone) : categoryLabels[place.category]}</T>
        {!!latest?.moment && <T variant="small" numberOfLines={3}>{latest.moment}</T>}
        {latest?.outingId && <T variant="small" color={colors.brand}>{state.outings.find(outing => outing.id === latest.outingId)?.title}</T>}
      </Pressable>;
    })}</View>;
  }} />;
}

export function SavedList({ state, places, onDone }: { state: AppState; places: Place[]; onDone: (placeId: string, wishlistIds: string[]) => Promise<unknown> }) {
  return <View>{places.map(place => {
    const lists = wishlistMemberships(state, place.id); const ids = [...new Set(lists.flatMap(list => list.entries.find(entry => entry.placeId === place.id)?.saverIds ?? []))];
    const visited = !!latestEdition(state, place.id); const done = lists.every(list => list.entries.find(entry => entry.placeId === place.id)?.completedBy.includes('you'));
    return <PlaceRow key={place.id} place={place} subtitle={`${lists.map(list => list.title).join(' · ')}\nSave date unavailable`} trailing={<View style={{ alignItems: 'flex-end', gap: 5 }}><AvatarStack ids={ids} />{done ? <View style={styles.done}><Icon name="check" size={14} /><T variant="small" color={colors.brand}>Done</T></View> : visited && <Pressable accessibilityRole="button" onPress={() => { void onDone(place.id, lists.map(list => list.id)).catch(() => undefined); }} style={styles.done}><Icon name="check" size={14} /><T variant="small" color={colors.brand}>Mark done</T></Pressable>}</View>} />;
  })}</View>;
}

export function CollectionMap({ state, places }: { state: AppState; places: Place[] }) {
  const [selectedId, setSelectedId] = useState<string>(); const selected = places.find(place => place.id === selectedId);
  const owned = collectedPlaceIds(state); const saved = savedPlaceIds(state);
  return <View style={{ gap: 14 }}><PlaceMap places={places} selectedId={selectedId} onSelect={setSelectedId} height={360} showPreview={false} />
    <T variant="small" muted>Accessible results are listed below the map.</T><View>{places.map(place => <PlaceRow key={place.id} place={place} />)}</View>
    <Sheet visible={!!selected} title={selected?.name ?? 'Place'} onClose={() => setSelectedId(undefined)}>{selected && <><PlacePhoto placeId={selected.id} uri={latestEdition(state, selected.id)?.photoUri} style={{ height: 170 }} /><T>{owned.includes(selected.id) ? 'Collected' : 'Not collected'}{saved.includes(selected.id) ? ' · Also in Want to go' : ''}</T><Button label="Open place" onPress={() => { setSelectedId(undefined); router.push({ pathname: '/place/[placeId]', params: { placeId: selected.id } }); }} /></>}</Sheet>
  </View>;
}
export function CollectionEmpty({ section, narrowed }: { section: 'been' | 'saved'; narrowed: boolean }) {
  return <EmptyState icon={section === 'been' ? 'image' : 'bookmark'} title={narrowed ? 'No matching places' : section === 'been' ? 'Your album is ready' : 'No saved places yet'} message={narrowed ? 'Clear or change your collection filters.' : section === 'been' ? 'Capture a visit to start keeping memories.' : 'Save a place from Discover and it will stay here.'} action={section === 'been' && !narrowed ? 'Capture a visit' : 'Explore places'} onPress={() => router.push(section === 'been' && !narrowed ? '/capture' : '/discover')} />;
}
const styles = StyleSheet.create({ grid: { flexDirection: 'row', gap: 12 }, badge: { position: 'absolute', right: 8, top: 8, backgroundColor: '#144F5DDD', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }, done: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3 } });
