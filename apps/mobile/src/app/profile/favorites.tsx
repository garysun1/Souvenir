import { router } from 'expo-router';
import { View } from 'react-native';
import { useApp } from '@/state/AppProvider';
import { placeById } from '@/fixtures/catalog';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { EmptyState, Header, IconButton, Screen, T } from '@/components/ui';

export default function FavoritesScreen() {
  const { state, commit } = useApp();
  const favorites = state.favorites.map(placeById).filter(item => item !== undefined);
  return <Screen>
    <Header back title="Favorites" subtitle={`${favorites.length} ${favorites.length === 1 ? 'place' : 'places'} · separate from Want to go`} />
    {favorites.length === 0 ? <EmptyState icon="heart" title="No favorites yet" message="Favorite is your private shortlist. It won't add a place to Want to go." action="Open your collection" onPress={() => router.push('/collection')} /> : <View>
      {favorites.map(place => <PlaceRow key={place.id} place={place} subtitle={`${place.neighborhood} · A private favorite`} trailing={<IconButton name="heart" label={`Remove ${place.name} from favorites`} filled onPress={() => { void commit({ type: 'FAVORITE', placeId: place.id }).catch(() => undefined); }} />} />)}
    </View>}
    <T variant="small" muted style={{ marginTop: 20 }}>Only you can see this list.</T>
  </Screen>;
}
