import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import type { PlaceMapProps } from './PlaceMap';
import type { Place } from '@/domain/types';
import SchematicPlaceMap from './SchematicPlaceMap';
import { Button, DemoLabel, Icon, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { useApp } from '@/state/AppProvider';
import { collectedPlaceIds, savedPlaceIds } from '@/state/selectors';
import { useDiscoveryMapOptions } from '@/features/discovery/MapSearchContext';
import { MapPlacePreview } from './MapPlacePreview';
import { clusterPoints, fitMapBounds, projectPoint } from './geometry';

class NativeMapBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function NativePlaceMap(props: PlaceMapProps) {
  return <NativeMapBoundary fallback={<View><T variant="small" muted>Native map unavailable. Showing the bundled schematic.</T><SchematicPlaceMap {...props} /></View>}><NativeMap {...props} /></NativeMapBoundary>;
}
function NativeMap(props: PlaceMapProps) {
  const { state } = useApp();
  const options = useDiscoveryMapOptions();
  const [schematic, setSchematic] = useState(false);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [region, setRegion] = useState<Region>(() => {
    const fitted = fitMapBounds(props.places);
    return { latitude: (fitted.north + fitted.south) / 2, longitude: (fitted.east + fitted.west) / 2, latitudeDelta: fitted.north - fitted.south, longitudeDelta: fitted.east - fitted.west };
  });
  const [width, setWidth] = useState(340);
  const [listOpen, setListOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string>();
  const [cluster, setCluster] = useState<Place[]>([]);
  const collected = useMemo(() => new Set(collectedPlaceIds(state)), [state]);
  const saved = useMemo(() => new Set(savedPlaceIds(state)), [state]);
  const mapHeight = props.height ?? 360;
  const currentBounds = { north: region.latitude + region.latitudeDelta / 2, south: region.latitude - region.latitudeDelta / 2, east: region.longitude + region.longitudeDelta / 2, west: region.longitude - region.longitudeDelta / 2 };
  const groups = clusterPoints(props.places.map(place => ({ place, ...projectPoint(place, currentBounds, width, mapHeight) })), 28);
  useEffect(() => {
    if (ready || schematic || state.preferences.offline) return;
    const timeout = setTimeout(() => setSchematic(true), 10000);
    return () => clearTimeout(timeout);
  }, [ready, schematic, state.preferences.offline]);
  const fallback = schematic || state.preferences.offline;
  if (fallback) return <View><T variant="small" muted>{state.preferences.offline ? 'Offline mode · bundled schematic' : 'Schematic fallback · no native tiles required'}</T><SchematicPlaceMap {...props} />{!state.preferences.offline && <Button label="Try native map" variant="ghost" onPress={() => { setReady(false); setSchematic(false); }} />}</View>;
  const searchArea = () => { options?.onSearchArea?.(currentBounds); setDirty(false); };
  const select = (place: Place) => { setCluster([]); if (props.showPreview !== false) setPreviewId(place.id); props.onSelect(place.id); };
  return <View style={styles.shell} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.caption}><DemoLabel label="Sample places · native basemap" small /></View>
    <MapView style={{ height: mapHeight }} initialRegion={region} onMapReady={() => setReady(true)} onRegionChangeComplete={next => { setRegion(next); setDirty(true); }} accessibilityLabel={`Los Angeles map with ${props.places.length} results`}>
      {groups.map(group => {
        const place = group[0].place; const isCollected = collected.has(place.id); const isSaved = saved.has(place.id); const selected = group.some(item => item.place.id === (previewId ?? props.selectedId)); const multiple = group.length > 1;
        return <Marker key={group.map(item => item.place.id).join(':')} coordinate={place} onPress={() => multiple ? setCluster(group.map(item => item.place)) : select(place)} accessibilityLabel={multiple ? `${group.length} places here` : place.name}>
          <View style={[styles.pin, (isCollected || multiple) && styles.collected, isSaved && !isCollected && !multiple && styles.saved, selected && styles.selected]}>{multiple ? <T variant="small" color="#fff">{group.length}</T> : isCollected ? <Icon name="check" size={14} color="#fff" /> : isSaved ? <Icon name="bookmark" size={13} /> : <View style={styles.dot} />}</View>
        </Marker>;
      })}
    </MapView>
    <View style={styles.actions}>{dirty && options?.onSearchArea ? <Button label="Search this area" variant="outline" onPress={searchArea} /> : <View />}<Pressable accessibilityRole="button" onPress={() => setSchematic(true)} style={styles.textButton}><T variant="small" color={colors.brand}>Use schematic</T></Pressable></View>
    <Pressable accessibilityRole="button" onPress={() => setListOpen(!listOpen)} style={styles.listToggle}><Icon name="list" size={17} /><T variant="label">{listOpen ? 'Hide' : 'Show'} accessible result list ({props.places.length})</T></Pressable>
    {listOpen && <View style={styles.list}>{props.places.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => select(place)} style={styles.result}><T style={{ flex: 1 }}>{place.name}</T><T variant="small" muted>{place.neighborhood}</T></Pressable>)}</View>}
    <Sheet visible={cluster.length > 0} onClose={() => setCluster([])} title={`${cluster.length} places here`}>{cluster.map(place => <Button key={place.id} variant="ghost" label={place.name} onPress={() => select(place)} />)}</Sheet>
    {props.showPreview !== false && <MapPlacePreview place={props.places.find(place => place.id === previewId)} onClose={() => setPreviewId(undefined)} />}
  </View>;
}
const styles = StyleSheet.create({ shell: { borderWidth: 1, borderColor: colors.border, borderRadius: 15, overflow: 'hidden' }, caption: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 }, pin: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.brand, backgroundColor: '#E9EEED', alignItems: 'center', justifyContent: 'center' }, collected: { backgroundColor: colors.brand }, saved: { backgroundColor: '#fff' }, selected: { width: 36, height: 36, borderRadius: 18, borderWidth: 4 }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand }, actions: { position: 'absolute', top: 50, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, textButton: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: '#fff', borderRadius: 22 }, listToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13 }, list: { paddingHorizontal: 13 }, result: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.divider, gap: 8 } });
