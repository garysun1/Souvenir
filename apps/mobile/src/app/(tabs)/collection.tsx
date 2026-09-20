import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useApp } from '@/state/AppProvider';
import { collectedPlaceIds, ownEditions, savedPlaceIds, setProgress } from '@/state/selectors';
import { collectionPlaces, defaultCollectionFilters, type CollectionFilters } from '@/domain/collection';
import { downtownSet } from '@/fixtures/catalog';
import { colors } from '@/design/tokens';
import { Button, Header, IconButton, Screen, Sheet, Tabs, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { CollectionFilterBar, filtersActive } from '@/features/collection/CollectionFilters';
import { Album, BeenList, CollectionEmpty, CollectionMap, SavedList } from '@/features/collection/CollectionViews';
import { AccountSets } from '@/features/collection/AccountSets';

type ViewMode = 'list' | 'album' | 'map';
export default function CollectionScreen() {
  const { state, commit } = useApp();
  const { outingId } = useLocalSearchParams<{ outingId?: string }>();
  const section = state.preferences.collectionSection;
  const initial = state.preferences.collectionView;
  const [views, setViews] = useState<{ been: ViewMode; saved: ViewMode }>({ been: initial, saved: initial });
  const [filters, setFilters] = useState<CollectionFilters>(() => ({ ...defaultCollectionFilters, outingId }));
  const [allEditions, setAllEditions] = useState(false);
  const [options, setOptions] = useState(false);
  const [outingsOpen, setOutingsOpen] = useState(false);
  const owned = collectedPlaceIds(state); const editions = ownEditions(state); const saved = savedPlaceIds(state);
  const activeFilters = section === 'been' ? filters : { ...filters, outingId: undefined };
  const places = section === 'sets' ? [] : collectionPlaces(state, section, activeFilters);
  const view = section === 'sets' ? 'list' : views[section];
  const changeSection = (next: 'been' | 'saved' | 'sets') => { void commit({ type: 'PREFERENCES', patch: { collectionSection: next } }).catch(() => undefined); };
  const changeView = (next: ViewMode) => {
    if (section === 'sets') return;
    setViews(current => ({ ...current, [section]: next }));
    void commit({ type: 'PREFERENCES', patch: { collectionView: next } }).catch(() => undefined);
  };
  const markDone = async (placeId: string, wishlistIds: string[]) => { for (const wishlistId of wishlistIds) await commit({ type: 'COMPLETE_WISHLIST', placeId, wishlistId }); };
  return <Screen scroll={false}>
    <Header title="Collection" subtitle={`${owned.length} places · ${editions.length} editions`} right={<IconButton name="more" label="Collection options" onPress={() => setOptions(true)} />} />
    <Tabs underline value={section} onChange={changeSection} options={[{ value: 'been', label: `Been ${owned.length}` }, { value: 'saved', label: `Want to go ${saved.length}` }, { value: 'sets', label: 'Sets' }]} />
    {section === 'sets' ? <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      {state.mode === 'account' ? <AccountSets /> : <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/sets/[setId]', params: { setId: downtownSet.id } })} style={styles.setCard}>
        <PlacePhoto placeId="la-central-library" style={{ height: 190 }}><View style={styles.cover}><T variant="title" color="#fff">{downtownSet.title}</T><T color="#fff">{setProgress(state)} of {downtownSet.placeIds.length} places collected</T></View></PlacePhoto>
        <View style={{ gap: 9 }}><T>{downtownSet.description}</T><View style={styles.progress}><View style={[styles.progressFill, { width: `${setProgress(state) / downtownSet.placeIds.length * 100}%` }]} /></View><T variant="label" color={colors.brand}>{setProgress(state) === downtownSet.placeIds.length ? 'Completed · View badge' : 'View set and plan remaining'} →</T></View>
      </Pressable>}
    </ScrollView> : <>
      <View style={styles.controls}><Tabs value={view} onChange={changeView} options={[{ value: 'album', label: 'Album' }, { value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} /></View>
      <View><CollectionFilterBar filters={activeFilters} onChange={setFilters} /></View>
      {section === 'been' && state.outings.length > 0 && <Button label={state.outings.find(outing => outing.id === filters.outingId)?.title ?? 'All outings & visits'} variant="ghost" onPress={() => setOutingsOpen(true)} />}
      {section === 'been' && view === 'album' && places.length > 0 && <View style={styles.gallerySwitch}><T variant="label">{allEditions ? 'Dated edition gallery' : 'Latest personal photo'}</T><Button label={allEditions ? 'Latest only' : 'All editions'} variant="ghost" onPress={() => setAllEditions(value => !value)} /></View>}
      {places.length > 0 && view === 'album' ? <Album state={state} places={places} filters={activeFilters} allEditions={section === 'been' && allEditions} /> : <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {places.length === 0 ? <CollectionEmpty section={section} narrowed={filtersActive(activeFilters)} /> : view === 'map' ? <CollectionMap state={state} places={places} /> : section === 'been' ? <BeenList state={state} places={places} filters={filters} /> : <SavedList state={state} places={places} onDone={markDone} />}
      </ScrollView>}
    </>}
    <Sheet visible={options} onClose={() => setOptions(false)} title="Your collection"><Button label="Import memories" icon="upload" onPress={() => { setOptions(false); router.push('/import/dropbox'); }} /><Button label="Favorites" variant="outline" icon="heart" onPress={() => { setOptions(false); router.push('/profile/favorites'); }} /><Button label="Private tips" variant="outline" icon="edit" onPress={() => { setOptions(false); router.push('/profile/tips'); }} /></Sheet>
    <Sheet visible={outingsOpen} onClose={() => setOutingsOpen(false)} title="Memories from an outing">
      <Button label="All outings & visits" variant="outline" onPress={() => { setFilters(current => ({ ...current, outingId: undefined })); setOutingsOpen(false); }} />
      {state.outings.map(outing => <Button key={outing.id} label={outing.title} variant="ghost" onPress={() => { setFilters(current => ({ ...current, outingId: outing.id })); setOutingsOpen(false); }} />)}
    </Sheet>
  </Screen>;
}
const styles = StyleSheet.create({ controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, gallerySwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, setCard: { gap: 14, paddingBottom: 18 }, cover: { flex: 1, justifyContent: 'flex-end', gap: 4, padding: 18, backgroundColor: '#00000044' }, progress: { height: 6, backgroundColor: colors.divider, borderRadius: 3, overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: colors.brand } });
