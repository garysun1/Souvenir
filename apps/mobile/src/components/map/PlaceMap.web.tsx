import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { View } from 'react-native';
import { mountDestinationMap } from '../../../../../shared/destination-map';
import { T } from '@/components/ui';
import { MapPlacePreview } from './MapPlacePreview';
import SchematicPlaceMap from './SchematicPlaceMap';
import type { PlaceMapProps } from './PlaceMap';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function PlaceMap({ places, onSelect, selectedId, height = 320, showPreview = true }: PlaceMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  const [previewId, setPreviewId] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!container.current || failed) return;
    return mountDestinationMap(maplibregl, container.current, places.map(place => ({ ...place, lat: place.latitude, lng: place.longitude })),
      id => { select.current(id); setPreviewId(id); }, () => setFailed(true));
  }, [places, failed]);
  if (failed) return <View style={{ gap: 8 }}><T variant="small" muted>Street map unavailable. Showing the schematic map and accessible results.</T><SchematicPlaceMap places={places} onSelect={onSelect} selectedId={selectedId} height={height} showPreview={showPreview} /></View>;
  return <View style={{ gap: 8 }}>
    <div ref={container} aria-label="Destination map" style={{ height, width: '100%', borderRadius: 14, overflow: 'hidden' }} />
    {showPreview && <MapPlacePreview place={places.find(place => place.id === previewId)} onClose={() => setPreviewId(undefined)} />}
  </View>;
}
