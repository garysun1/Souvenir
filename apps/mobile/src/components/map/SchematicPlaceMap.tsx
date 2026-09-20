import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Place } from '@/domain/types';
import type { PlaceMapProps } from './PlaceMap';
import { Button, DemoLabel, Icon, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { useApp } from '@/state/AppProvider';
import { collectedPlaceIds, savedPlaceIds } from '@/state/selectors';
import { useDiscoveryMapOptions } from '@/features/discovery/MapSearchContext';
import { clusterPoints, fitMapBounds, projectPoint, viewportBounds } from './geometry';
import { MapPlacePreview } from './MapPlacePreview';

export default function SchematicPlaceMap({ places, onSelect, selectedId, height = 360, showPreview = true }: PlaceMapProps) {
  const { state } = useApp();
  const options = useDiscoveryMapOptions();
  const [width, setWidth] = useState(340);
  const [bounds, setBounds] = useState(() => fitMapBounds(places));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dirty, setDirty] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [cluster, setCluster] = useState<Place[]>([]);
  const [previewId, setPreviewId] = useState<string>();
  const mapHeight = Math.max(240, height - 50);
  const collected = useMemo(() => new Set(collectedPlaceIds(state)), [state]);
  const saved = useMemo(() => new Set(savedPlaceIds(state)), [state]);
  const projected = useMemo(() => places.map(place => ({ place, ...projectPoint(place, bounds, width, mapHeight) })), [places, bounds, width, mapHeight]);
  const groups = useMemo(() => clusterPoints(projected, 30 / zoom), [projected, zoom]);
  const previousGesture = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  // PanResponder.create registers these callbacks; refs are only read during gesture events.
  /* eslint-disable react-hooks/refs */
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => { dragging.current = false; return false; },
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5,
    onPanResponderGrant: () => { dragging.current = true; previousGesture.current = { x: 0, y: 0 }; },
    onPanResponderMove: (_, gesture) => {
      const dx = gesture.dx - previousGesture.current.x; const dy = gesture.dy - previousGesture.current.y;
      previousGesture.current = { x: gesture.dx, y: gesture.dy };
      setPan(current => ({ x: current.x + dx, y: current.y + dy }));
    },
    onPanResponderRelease: () => setDirty(true),
  }), []);
  /* eslint-enable react-hooks/refs */
  const select = (place: Place) => { setCluster([]); if (showPreview) setPreviewId(place.id); onSelect(place.id); };
  const setMapZoom = (next: number) => { setZoom(Math.max(1, Math.min(12, next))); setDirty(true); };
  const move = (dx: number, dy: number) => { setPan(current => ({ x: current.x + dx, y: current.y + dy })); setDirty(true); };
  const fit = () => { setBounds(fitMapBounds(places)); setZoom(1); setPan({ x: 0, y: 0 }); setDirty(false); };
  const searchVisibleArea = () => { options?.onSearchArea?.(viewportBounds(bounds, width, mapHeight, zoom, pan)); setDirty(false); };
  const point = (latitude: number, longitude: number) => projectPoint({ latitude, longitude }, bounds, width, mapHeight);
  const path = (coordinates: [number, number][], close = false) => coordinates.map(([lat, lng], index) => { const p = point(lat, lng); return `${index ? 'L' : 'M'}${p.x} ${p.y}`; }).join(' ') + (close ? ' Z' : '');
  const labels: [string, number, number][] = [['HOLLYWOOD', 34.10, -118.35], ['DOWNTOWN', 34.041, -118.248], ['SANTA MONICA', 34.035, -118.50], ['GRIFFITH PARK', 34.153, -118.295], ['PACIFIC OCEAN', 33.91, -118.52], ['SAN PEDRO', 33.735, -118.30]];
  return <View style={styles.shell} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.label}><DemoLabel label="Demo map — schematic" small /><Pressable accessibilityRole="button" onPress={fit} style={styles.fit}><T variant="small" color={colors.brand}>Fit results</T></Pressable></View>
    <View style={{ height: mapHeight, overflow: 'hidden' }} {...responder.panHandlers}>
      <Svg width={width} height={mapHeight} accessibilityLabel={`Schematic Los Angeles map with ${places.length} results`}>
        <Rect width={width} height={mapHeight} fill="#E4EFF0" />
        <G transform={`translate(${width / 2 + pan.x} ${mapHeight / 2 + pan.y}) scale(${zoom}) translate(${-width / 2} ${-mapHeight / 2})`}>
          <Path d={path([[34.6, -118.8], [34.035, -118.54], [34.02, -118.50], [33.98, -118.47], [33.93, -118.43], [33.85, -118.40], [33.76, -118.42], [33.70, -118.30], [33.73, -118.23], [33.4, -117.6], [34.6, -117.6]], true)} fill="#F7F4EC" stroke="#CBDEDD" strokeWidth={2 / zoom} />
          <Path d={path([[34.165, -118.31], [34.16, -118.275], [34.128, -118.27], [34.116, -118.30]], true)} fill="#D8E5D5" />
          <Path d={path([[34.09, -118.25], [34.084, -118.23], [34.075, -118.235]], true)} fill="#D8E5D5" />
          <Path d={path([[34.17, -118.48], [34.15, -118.38], [34.11, -118.34], [34.08, -118.30], [34.057, -118.245], [34.07, -118.14]])} fill="none" stroke="#E0D3BD" strokeWidth={3 / zoom} />
          <Path d={path([[34.02, -118.50], [34.037, -118.35], [34.029, -118.28], [34.021, -118.18]])} fill="none" stroke="#E0D3BD" strokeWidth={3 / zoom} />
          <Path d={path([[34.18, -118.265], [34.10, -118.25], [34.06, -118.22], [34.0, -118.22], [33.88, -118.17], [33.76, -118.2]])} fill="none" stroke="#BDD5D9" strokeWidth={3 / zoom} />
          {[-118.32, -118.30, -118.28, -118.26, -118.24].map(lng => <Path key={lng} d={path([[34.10, lng], [33.99, lng + .016]])} stroke="#E7E1D6" strokeWidth={1 / zoom} />)}
          {[34.0, 34.02, 34.04, 34.06, 34.08].map(lat => <Path key={lat} d={path([[lat, -118.34], [lat + .003, -118.21]])} stroke="#E7E1D6" strokeWidth={1 / zoom} />)}
          {labels.map(([label, lat, lng]) => { const p = point(lat, lng); return <SvgText key={label} x={p.x} y={p.y} fontSize={9 / zoom} fill="#778078" textAnchor="middle" letterSpacing={.8 / zoom}>{label}</SvgText>; })}
          {groups.map(group => {
            const head = group[0]; const selected = group.some(item => item.place.id === (previewId ?? selectedId));
            const isCollected = group.some(item => collected.has(item.place.id)); const isSaved = group.some(item => saved.has(item.place.id));
            const multiple = group.length > 1;
            const key = group.map(item => item.place.id).join(':');
            const transform = `translate(${head.x} ${head.y}) scale(${1 / zoom})`;
            const label = multiple ? `${group.length} places here` : head.place.name;
            const activate = () => multiple ? setCluster(group.map(item => item.place)) : select(head.place);
            const glyph = <>
              {selected && <Circle r="20" fill="#FFFFFF99" stroke={colors.brand} strokeWidth="2" />}
              <Circle r={multiple ? 15 : 12} fill={isCollected || multiple ? colors.brand : '#fff'} stroke={isSaved || isCollected || multiple ? colors.brand : '#889A97'} strokeWidth="2" />
              {multiple ? <SvgText y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{group.length}</SvgText> : isCollected ? <Path d="M-5 0l3 3 7-7" fill="none" stroke="#fff" strokeWidth="2" /> : isSaved ? <Path d="M-4-6h8v12L0 3-4 6Z" fill="none" stroke={colors.brand} strokeWidth="1.6" /> : <Circle r="3" fill="#889A97" />}
              <Circle r="20" fill="transparent" />
            </>;
            return Platform.OS === 'web'
              ? <g key={key} transform={transform} role="button" aria-label={label} tabIndex={0} onClick={event => { if (!dragging.current || event.detail === 0) activate(); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } }} style={{ cursor: 'pointer' }}>{glyph}</g>
              : <G key={key} transform={transform} onPress={activate} accessibilityLabel={label}>{glyph}</G>;
          })}
        </G>
      </Svg>
      <View style={styles.zoom}><Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setMapZoom(zoom * 1.5)} style={styles.control}><T variant="heading">+</T></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setMapZoom(zoom / 1.5)} style={styles.control}><T variant="heading">−</T></Pressable></View>
      <View style={styles.panControls}>{([{ label: 'Pan west', text: '←', x: 60, y: 0 }, { label: 'Pan east', text: '→', x: -60, y: 0 }, { label: 'Pan north', text: '↑', x: 0, y: 60 }, { label: 'Pan south', text: '↓', x: 0, y: -60 }]).map(control => <Pressable key={control.label} accessibilityRole="button" accessibilityLabel={control.label} style={styles.control} onPress={() => move(control.x, control.y)}><T color={colors.brand}>{control.text}</T></Pressable>)}</View>
      {dirty && options?.onSearchArea && <View style={styles.searchArea}><Button label="Search this area" variant="outline" onPress={searchVisibleArea} /></View>}
      {!places.length && <View style={styles.noPins}><T>No matching pins in this result set.</T></View>}
    </View>
    <View style={styles.legend}><T variant="small" muted>Filled + check: collected · Bookmark: saved</T><T variant="small" muted>Outline: discover · Numbers: nearby places</T></View>
    <Pressable accessibilityRole="button" onPress={() => setListOpen(!listOpen)} style={styles.listToggle}><Icon name="list" size={17} /><T variant="label">{listOpen ? 'Hide' : 'Show'} accessible result list ({places.length})</T></Pressable>
    {listOpen && <View style={styles.list}>{places.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => select(place)} style={styles.result}><T style={{ flex: 1 }}>{place.name}</T><T variant="small" muted>{place.neighborhood}</T></Pressable>)}</View>}
    <Sheet visible={cluster.length > 0} onClose={() => setCluster([])} title={`${cluster.length} places here`}><T muted>These nearby schematic pins overlap. Choose a destination.</T>{cluster.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => select(place)} style={styles.clusterRow}><T variant="place" style={{ flex: 1 }}>{place.name}</T><Icon name="chevron" size={17} /></Pressable>)}</Sheet>
    {showPreview && <MapPlacePreview place={places.find(place => place.id === previewId)} onClose={() => setPreviewId(undefined)} />}
  </View>;
}
const styles = StyleSheet.create({
  shell: { borderWidth: 1, borderColor: colors.border, borderRadius: 15, overflow: 'hidden', backgroundColor: '#fff' }, label: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fit: { minHeight: 44, justifyContent: 'center' },
  zoom: { position: 'absolute', right: 10, top: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 9, overflow: 'hidden', backgroundColor: '#fff' }, control: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, panControls: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', borderRadius: 9, backgroundColor: '#FFFFFFEE', borderWidth: 1, borderColor: colors.border },
  searchArea: { position: 'absolute', top: 10, left: 10 }, noPins: { position: 'absolute', top: '40%', alignSelf: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 12 },
  legend: { gap: 2, padding: 10, borderTopWidth: 1, borderTopColor: colors.divider }, listToggle: { minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 13, borderTopWidth: 1, borderTopColor: colors.divider }, list: { paddingHorizontal: 13 }, result: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.divider }, clusterRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider },
});
