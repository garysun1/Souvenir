import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { Button, Chip, ChipRow, DemoLabel, EmptyState, Icon, IconButton, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { availabilityLabel, emptyFilters, filterChips, queryForFilters, removeFilter, searchPlaces, type SearchFilters } from '@/domain/search';
import { downtownSet, placeById, places } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { ownEditions, setProgress } from '@/state/selectors';
import { DiscoveryCard, FilterSheet, PlannerCard, SearchLauncher } from '@/features/discovery/components';
import { downtownLocation, requestDiscoveryLocation, type DiscoveryLocation } from '@/platform/location';
import { AccountSets } from '@/features/collection/AccountSets';

export default function Discover() {
  const { state } = useApp();
  const [location, setLocation] = useState<DiscoveryLocation>(downtownLocation());
  const [locationSheet, setLocationSheet] = useState(false);
  const [locating, setLocating] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const recommendations = useMemo(() => searchPlaces(places, filters, { state, origin: location.origin }).slice(0, 2), [state, location, filters]);
  const nearby = useMemo(() => searchPlaces(places, { ...filters, radiusKm: filters.radiusKm ?? 8 }, { state, origin: location.origin }).sort((a, b) => a.distanceKm - b.distanceKm || a.place.id.localeCompare(b.place.id)).slice(0, 3), [state, location, filters]);
  const collected = setProgress(state);
  const nextSetPlace = downtownSet.placeIds.map(placeById).find(place => place && !ownEditions(state).some(edition => edition.placeId === place.id));
  const chips = filterChips(filters);
  const openSearch = (query = queryForFilters(filters), view: 'list' | 'map' = 'list') => router.push({ pathname: '/search', params: { query, view, ...(location.device ? { lat: String(location.origin.latitude), lng: String(location.origin.longitude) } : {}) } });
  const useLocation = async () => { setLocating(true); const next = await requestDiscoveryLocation(); setLocation(next); setLocating(false); };
  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Choose starting point. ${location.label}`} onPress={() => setLocationSheet(true)} style={styles.location}><Icon name="pin" size={15} /><T variant="small" color={colors.brand} style={{ flex: 1 }} numberOfLines={1}>{location.device ? 'Near you' : 'Los Angeles'}</T><Icon name="down" size={12} /></Pressable>
      <T variant="wordmark" color={colors.brand} style={styles.wordmark}>souvenir</T>
      <View style={styles.headerRight}><IconButton name="sparkles" label="Plan an afternoon" onPress={() => router.push('/planner')} /></View>
    </View>
    <SearchLauncher onPress={() => openSearch()} />
    <ChipRow>
      <Chip label={filters.radiusKm ? `${filters.radiusKm} km nearby` : 'Nearby'} selected={filters.radiusKm !== undefined} icon="pin" onPress={() => setFilters(filters.radiusKm !== undefined ? removeFilter(filters, 'radius') : { ...filters, radiusKm: 8 })} />
      <Chip label="Free" selected={filters.maxPriceCents === 0} onPress={() => setFilters(filters.maxPriceCents === 0 ? removeFilter(filters, 'budget') : { ...filters, maxPriceCents: 0 })} />
      <Chip label="Open now" selected={filters.openNow} icon="clock" onPress={() => setFilters({ ...filters, openNow: !filters.openNow })} />
      <Chip label={filters.categories.length ? `Category (${filters.categories.length})` : 'Category'} selected={filters.categories.length > 0} icon="down" onPress={() => setFiltersOpen(true)} />
      {!!chips.length && <Pressable accessibilityRole="button" onPress={() => setFilters(emptyFilters())} style={styles.clear}><T variant="small" color={colors.brand}>Reset</T></Pressable>}
    </ChipRow>
    <SectionHeading title={ownEditions(state).length ? 'For you' : 'Start exploring'} action="See all" onPress={() => openSearch()} />
    <View style={styles.cards}>{recommendations.map(hit => <DiscoveryCard key={hit.place.id} place={hit.place} reason={hit.reason} />)}</View>
    {!recommendations.length && <EmptyState title="No matches for these filters" message={filters.openNow && state.preferences.sourceStatus !== 'sample' ? 'Hours are unknown while this source is unavailable or stale. Unknown hours cannot pass Open now.' : 'We never relax your filters silently. Try a different category, tag or budget.'} action="Reset filters" onPress={() => setFilters(emptyFilters())} />}
    <SectionHeading title="Nearby now" action="Map" onPress={() => openSearch(queryForFilters({ ...filters, radiusKm: filters.radiusKm ?? 8 }), 'map')} />
    <DemoLabel label={`${location.label} · sample hours, not live`} small />
    <View>{nearby.map(hit => <PlaceRow key={hit.place.id} place={hit.place} subtitle={`${hit.distanceKm.toFixed(1)} km · ${availabilityLabel(hit.place, state)}`} />)}</View>
    {!nearby.length && <View style={styles.nearbyEmpty}><T muted>No matching catalog places within {filters.radiusKm ?? 8} km of this starting point.</T><Button label="Change starting point" variant="ghost" onPress={() => setLocationSheet(true)} /></View>}
    <Pressable accessibilityRole="button" onPress={() => router.push('/settings/sources')} style={styles.weather}><Icon name="cloud" size={18} color={colors.muted} /><T variant="small" muted style={{ flex: 1 }}>Weather unknown · {state.preferences.sourceStatus === 'sample' ? 'no forecast in the place catalog' : `source ${state.preferences.sourceStatus}`}</T><Icon name="info" size={15} color={colors.muted} /></Pressable>
    <SectionHeading title={state.mode === 'account' ? 'Catalog sets' : 'Downtown Firsts'} />
    {state.mode === 'account' ? <AccountSets /> : <Pressable accessibilityRole="button" onPress={() => router.push('/sets/downtown-firsts')} style={styles.setCard}>
      <PlacePhoto placeId={nextSetPlace?.id ?? downtownSet.placeIds[0]} style={styles.setImage} />
      <View style={styles.setCopy}><T variant="heading">Three Downtown icons</T><T muted>{downtownSet.description}</T><View accessibilityLabel={`${collected} of 3 places collected`} style={styles.progress}><View style={[styles.progressDone, { width: `${(collected / 3) * 100}%` }]} /></View><T variant="small" color={colors.brand}>{collected} of 3 places collected · View set</T></View>
    </Pressable>}
    <PlannerCard />
    <FilterSheet visible={filtersOpen} filters={filters} onChange={setFilters} onClose={() => setFiltersOpen(false)} />
    <Sheet visible={locationSheet} onClose={() => setLocationSheet(false)} title="Starting point"><T>{location.message}</T><DemoLabel label={location.label} /><Button label="Use my location" loading={locating} icon="pin" onPress={useLocation} />{location.device && <Button label="Use Downtown sample instead" variant="outline" onPress={() => setLocation(downtownLocation('Downtown sample origin selected.'))} />}<T variant="small" muted>Location is requested only after tapping. Souvenir uses foreground access for distance sorting and does not track in the background.</T></Sheet>
  </Screen>;
}
const styles = StyleSheet.create({
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, location: { width: 94, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 }, headerRight: { width: 94, alignItems: 'flex-end' }, wordmark: { fontSize: 25, flex: 1, textAlign: 'center' }, clear: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  cards: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, nearbyEmpty: { paddingTop: 14, gap: 5 }, weather: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8 },
  setCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' }, setImage: { height: 150, width: '100%', borderRadius: 0 }, setCopy: { padding: 16, gap: 5 }, progress: { height: 5, backgroundColor: colors.divider, borderRadius: 3, overflow: 'hidden', marginVertical: 7 }, progressDone: { height: '100%', backgroundColor: colors.brand },
});
