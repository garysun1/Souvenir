import { router } from 'expo-router';
import { Button, T } from '@/components/ui';
import { sets } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { collectedPlaceIds } from '@/state/selectors';

export function AccountSets() {
  const { state } = useApp();
  const owned = collectedPlaceIds(state);
  return <>{sets.map(set => <Button key={set.id} variant="outline" label={`${set.title} · ${set.placeIds.filter(id => owned.includes(id)).length}/${set.placeIds.length} places`} onPress={() => router.push({ pathname: '/sets/[setId]', params: { setId: set.id } })} />)}{!sets.length && <T muted>No catalog sets are available yet.</T>}</>;
}
