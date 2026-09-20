import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { PlaceRow } from '@/components/cards/PlaceRow';
import PlaceMap from '@/components/map/PlaceMap';
import { Button, Chip, ChipRow, DemoLabel, EmptyState, Header, Icon, IconButton, Screen, Sheet, T, Tabs } from '@/components/ui';
import { colors, fonts } from '@/design/tokens';
import { appealFor, availabilityLabel, createRequestGate, emptyFilters, filterChips, parseSearch, removeFilter, requestSearch, searchPlaces, type SearchFilters } from '@/domain/search';
import { places } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { FilterSheet } from '@/features/discovery/components';
import { DiscoveryMapProvider } from '@/features/discovery/MapSearchContext';
import { downtownLocation, requestDiscoveryLocation, type DiscoveryLocation } from '@/platform/location';

const examples = ['Quiet, free cultural place near us', 'Gardens nearby', 'Art open now'];
export default function SearchScreen() {
  const params = useLocalSearchParams<{ query?: string; view?: string; lat?: string; lng?: string }>();
  const { state } = useApp();
  const initial = typeof params.query === 'string' ? params.query : '';
  const initialLocation = useMemo(() => {
    const lat = Number(params.lat); const lng = Number(params.lng);
    return params.lat && params.lng && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { origin: { latitude: lat, longitude: lng }, label: 'Your device location', message: 'Using the device location you chose in Discover. Destination facts remain sample data.', device: true }
      : downtownLocation();
  }, [params.lat, params.lng]);
  const initialParsed = useMemo(() => parseSearch(initial), [initial]);
  const [query, setQuery] = useState(initial);
  const [filters, setFilters] = useState<SearchFilters>(initialParsed.filters);
  const [appliedFilters, setAppliedFilters] = useState(initialParsed.filters);
  const [appliedOrigin, setAppliedOrigin] = useState(initialLocation.origin);
  const [explanation, setExplanation] = useState(initialParsed.explanation);
  const [view, setView] = useState<'list' | 'map'>(params.view === 'map' ? 'map' : 'list');
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<DiscoveryLocation>(initialLocation);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>(initial ? [initial] : []);
  const [selectedId, setSelectedId] = useState<string>();
  const [gate] = useState(createRequestGate);
  // Store changes re-rank the last resolved request; an in-flight query never clears its results.
  const hits = useMemo(() => searchPlaces(places, appliedFilters, { state, origin: appliedOrigin }), [appliedFilters, appliedOrigin, state]);
  const run = useCallback(async (nextFilters: SearchFilters, nextExplanation = explanation, origin = location.origin) => {
    setLoading(true); setSearchError(false); setExplanation(nextExplanation);
    const id = gate.next();
    try {
      const response = await requestSearch(places, nextFilters, { state, origin }, id);
      if (gate.isCurrent(response.requestId)) { setAppliedFilters(nextFilters); setAppliedOrigin(origin); setLoading(false); }
    } catch {
      if (gate.isCurrent(id)) { setSearchError(true); setLoading(false); }
    }
  }, [explanation, gate, location.origin, state]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseSearch(query);
      setSuggestions(query.trim().length < 2 ? [] : searchPlaces(places, parsed.filters, { state, origin: location.origin }).slice(0, 3).map(hit => hit.place.name));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, state, location.origin]);
  useEffect(() => () => { gate.next(); }, [gate]);
  const submit = (value = query) => {
    const parsed = parseSearch(value);
    setQuery(value); setFilters(parsed.filters); setSuggestions([]);
    if (value.trim()) setRecent(current => [value.trim(), ...current.filter(item => item !== value.trim())].slice(0, 5));
    void run(parsed.filters, parsed.explanation);
  };
  const changeFilters = (next: SearchFilters) => { setFilters(next); void run(next, 'I interpreted these filters; you can remove a chip or refine it in Filters. Search text is kept for reference.'); };
  const remove = (key: string) => changeFilters(removeFilter(filters, key));
  const clearAll = () => { const next = emptyFilters(); setQuery(''); setSuggestions([]); setFilters(next); void run(next, 'Showing the bundled Los Angeles catalog. Nothing is live-verified.'); };
  const useLocation = async () => { setLocating(true); const next = await requestDiscoveryLocation(); setLocation(next); setLocating(false); setLocationOpen(false); void run(filters, explanation, next.origin); };
  const chips = filterChips(filters);
  const removable = state.preferences.sourceStatus !== 'sample' && filters.openNow ? chips.find(chip => chip.key === 'hours') : chips.find(chip => chip.key === 'text') ?? chips[0];
  const demoTime = new Date(state.clock).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return <Screen>
    <Header title="Search" back right={<IconButton name="pin" label={`Starting point: ${location.label}`} onPress={() => setLocationOpen(true)} />} />
    <View style={styles.searchBox}>
      <TextInput accessibilityLabel="Search places" value={query} onChangeText={setQuery} onSubmitEditing={() => submit()} returnKeyType="search" autoFocus={!initial} placeholder="Quiet, free cultural place near us" placeholderTextColor="#808080" style={styles.input} />
      {!!query && <IconButton name="close" label="Clear search and filters" onPress={clearAll} />}
      <IconButton name="search" label="Submit search" onPress={() => submit()} />
    </View>
    {!!suggestions.length && <View style={styles.suggestions}>{suggestions.map(suggestion => <Pressable key={suggestion} accessibilityRole="button" onPress={() => submit(suggestion)} style={styles.suggestion}><Icon name="search" size={15} /><T style={{ flex: 1 }}>{suggestion}</T></Pressable>)}</View>}
    {!query && !chips.length && <View style={{ gap: 7, marginTop: 15 }}>
      {!!recent.length && <><View style={styles.recentHeader}><T variant="label" style={{ flex: 1 }}>Recent searches</T><Pressable accessibilityRole="button" onPress={() => setRecent([])} style={styles.clear}><T variant="small" color={colors.brand}>Clear history</T></Pressable></View>{recent.map(item => <Pressable key={item} accessibilityRole="button" onPress={() => submit(item)} style={styles.recent}><Icon name="clock" size={16} color={colors.muted} /><T muted style={{ flex: 1 }}>{item}</T></Pressable>)}</>}
      <T variant="label">Try a search</T>{examples.map(item => <Pressable key={item} accessibilityRole="button" onPress={() => submit(item)} style={styles.recent}><Icon name="search" size={16} color={colors.muted} /><T muted style={{ flex: 1 }}>{item}</T></Pressable>)}
    </View>}
    <ChipRow>{chips.map(chip => <Chip key={chip.key} selected label={`${chip.label}  ×`} onPress={() => remove(chip.key)} />)}<Chip label="Filters" icon="down" onPress={() => setFiltersOpen(true)} />{!!chips.length && <Pressable accessibilityRole="button" onPress={clearAll} style={styles.clear}><T variant="small" color={colors.brand}>Clear all</T></Pressable>}</ChipRow>
    <View style={styles.context}><T variant="small" muted>{explanation}</T><DemoLabel label={location.label} small /><T variant="small" muted>Demo clock · {demoTime} Los Angeles</T></View>
    {state.preferences.sourceStatus !== 'sample' && <View style={styles.notice}><T variant="small">Hours are unknown because the source is {state.preferences.sourceStatus}. Unknown hours do not pass the “Open now” filter.</T></View>}
    {searchError && <View style={styles.notice}><T>Search could not finish. Your previous results are still here.</T><Button label="Retry search" variant="outline" onPress={() => run(filters)} /></View>}
    <View style={styles.resultsHeader}><View style={{ flex: 1 }}><T variant="heading">{hits.length} {hits.length === 1 ? 'place' : 'places'}</T>{loading && <View style={styles.loading}><ActivityIndicator size="small" color={colors.brand} /><T variant="small" muted>Updating results…</T></View>}</View><Tabs value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} /></View>
    {!hits.length && !loading ? <EmptyState title="No exact matches" message="Your requested budget, radius, hours and tags were not relaxed. Remove one filter or refine the wording." action={removable ? `Remove ${removable.label}` : 'Clear filters'} onPress={() => removable ? remove(removable.key) : clearAll()} icon="search" /> : view === 'list' ?
      <View>{hits.map(hit => <PlaceRow key={hit.place.id} place={hit.place} subtitle={`${hit.distanceKm < 10 ? hit.distanceKm.toFixed(1) : Math.round(hit.distanceKm)} km · ${availabilityLabel(hit.place, state)}\n${appealFor(hit.place, state).label}`} />)}</View> :
      <DiscoveryMapProvider value={{ origin: location.origin, onSearchArea: bounds => changeFilters({ ...filters, bounds }) }}><PlaceMap places={hits.map(hit => hit.place)} selectedId={selectedId} onSelect={setSelectedId} height={410} /></DiscoveryMapProvider>}
    <FilterSheet visible={filtersOpen} filters={filters} onChange={changeFilters} onClose={() => setFiltersOpen(false)} />
    <Sheet visible={locationOpen} onClose={() => setLocationOpen(false)} title="Search starting point"><T>{location.message}</T><DemoLabel label={location.label} /><Button label="Use my location" loading={locating} icon="pin" onPress={useLocation} />{location.device && <Button label="Use Downtown sample instead" variant="outline" onPress={() => { const next = downtownLocation('Downtown sample origin selected.'); setLocation(next); setLocationOpen(false); void run(filters, explanation, next.origin); }} />}<T variant="small" muted>Foreground location changes distance and radius filtering only. Hours and availability remain sample or unknown.</T></Sheet>
  </Screen>;
}
const styles = StyleSheet.create({
  searchBox: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: colors.surface, paddingLeft: 14 }, input: { flex: 1, minWidth: 0, minHeight: 52, fontFamily: fonts.body, fontSize: 15, color: colors.text },
  suggestions: { borderWidth: 1, borderColor: colors.divider, borderRadius: 12, paddingHorizontal: 12 }, suggestion: { minHeight: 48, flexDirection: 'row', gap: 9, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider }, recentHeader: { flexDirection: 'row', alignItems: 'center' }, recent: { minHeight: 44, flexDirection: 'row', gap: 9, alignItems: 'center' }, clear: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  context: { gap: 4, paddingVertical: 6 }, notice: { gap: 10, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginTop: 10 }, resultsHeader: { marginTop: 17, marginBottom: 3, flexDirection: 'row', alignItems: 'center', gap: 12 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
