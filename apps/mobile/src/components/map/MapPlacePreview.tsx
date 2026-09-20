import { router } from 'expo-router';
import { View } from 'react-native';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { Button, DemoLabel, Sheet, T } from '@/components/ui';
import type { Place } from '@/domain/types';
import { availabilityLabel } from '@/domain/search';
import { useApp } from '@/state/AppProvider';
import { collectedPlaceIds, savedPlaceIds } from '@/state/selectors';

export function MapPlacePreview({ place, onClose }: { place?: Place; onClose: () => void }) {
  const { state } = useApp();
  if (!place) return null;
  const collected = collectedPlaceIds(state).includes(place.id);
  const saved = savedPlaceIds(state).includes(place.id);
  return <Sheet visible onClose={onClose} title={place.name}>
    <PlacePhoto placeId={place.id} style={{ height: 160, borderRadius: 12 }} />
    <T muted>{place.neighborhood} · {availabilityLabel(place, state)}</T>
    <View style={{ gap: 4 }}><T variant="label">{collected ? 'In your collection' : 'Not collected yet'}{saved ? ' · Also on Want to go' : ''}</T><T>{place.summary}</T></View>
    <DemoLabel label="Sample destination data — not live verified" />
    <Button label="View place" onPress={() => { onClose(); router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } }); }} />
  </Sheet>;
}
