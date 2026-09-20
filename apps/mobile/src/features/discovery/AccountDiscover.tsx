import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import type { TrendingDto } from '../../../../../shared/worldwide-contract';
import { Button, Field, Header, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { destinationCities } from '../../../../../shared/destinations';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { places } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { useAccountResource } from '@/lib/useAccountResource';
import { mapPlace } from '@/lib/bootstrap';
import { frequencyLabel, queryString } from '@/lib/worldwide';
import { AccountCatalog } from './AccountCatalog';
import { ResourceStatus } from './AccountPlaceDetail';
import { AccountSets } from '@/features/collection/AccountSets';

export function AccountDiscover() {
  const { mergePlaces } = useApp();
  const [citySearch, setCitySearch] = useState('');
  const [choosingCity, setChoosingCity] = useState(false);
  const [filter, setFilter] = useState<{ city: string; country: string }>();
  const trending = useAccountResource<TrendingDto>(filter?.country ? `/api/places/trending?${queryString({ ...filter, limit: 12 })}` : undefined);
  const cities = destinationCities(places, true);
  useEffect(() => { if (trending.data) mergePlaces(trending.data.places); }, [trending.data, mergePlaces]);
  return <Screen><Header title="Discover" subtitle="Find your next adventure" />
    <T muted>Discover a place. Go together. Keep a souvenir.</T>
    <Button variant="outline" label={filter ? `Exploring ${filter.city}` : 'Where are you exploring?'} onPress={() => setChoosingCity(true)} />
    <Sheet visible={choosingCity} title="Where are you exploring?" onClose={() => setChoosingCity(false)}>
      <Field label="Find a city" value={citySearch} onChangeText={setCitySearch} placeholder="Search cities or countries" />
      <Button label="Worldwide" variant="outline" onPress={() => { setFilter(undefined); setChoosingCity(false); }} />
      <View style={{ gap: 8 }}>{cities.filter(item => item.label.toLowerCase().includes(citySearch.toLowerCase())).map(item => <Button key={item.label} label={item.label} variant="ghost" onPress={() => { setFilter({ city: item.city, country: item.country }); setChoosingCity(false); }} />)}</View>
      {!cities.some(item => item.label.toLowerCase().includes(citySearch.toLowerCase())) && <T muted>No catalog city matches. Try searching by destination name.</T>}
    </Sheet>
    {filter?.country && <><SectionHeading title={`Trending in ${filter.city}`} /><ResourceStatus {...trending} />
      {trending.data && <><T variant="small" muted>Souvenir activity · computed {trending.data.computedAt ?? 'unavailable'}. Recent collectors compared with the previous eight-week baseline.</T>
        {trending.data.places.map(place => <PlaceRow key={place.id} place={mapPlace(place)} subtitle={frequencyLabel(place.metrics)} />)}
        {!trending.data.places.length && <T muted>No trending destinations with enough activity in this city yet.</T>}</>}
    </>}
    <SectionHeading title={filter ? `Places in ${filter.city}` : 'Global destinations'} /><AccountCatalog city={filter?.city} country={filter?.country} />
    <SectionHeading title="Explore sets" /><AccountSets />
    <Button label="Turn saved places into an outing" onPress={() => router.push('/planner')} />
    <Button label="See friends’ discoveries" variant="outline" onPress={() => router.push('/friends')} />
  </Screen>;
}
