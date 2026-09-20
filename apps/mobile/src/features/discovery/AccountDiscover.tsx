import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { TrendingDto } from '../../../../../shared/worldwide-contract';
import { Button, Chip, ChipRow, Field, Header, Screen, SectionHeading, T } from '@/components/ui';
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
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [filter, setFilter] = useState<{ city: string; country: string }>();
  const trending = useAccountResource<TrendingDto>(filter ? `/api/places/trending?${queryString({ ...filter, limit: 12 })}` : undefined);
  const cities = [...new Map(places.filter(place => place.city && place.country).map(place => [`${place.country}:${place.city}`, { city: place.city!, country: place.country! }])).values()].sort((a, b) => a.city.localeCompare(b.city));
  useEffect(() => { if (trending.data) mergePlaces(trending.data.places); }, [trending.data, mergePlaces]);
  return <Screen><Header title="Discover" subtitle="Destinations around the world" />
    <T muted>Choose a city and country to see its catalog and activity trends. Location is requested only when you ask for nearby places.</T>
    <ChipRow><Chip label="Worldwide" selected={!filter} onPress={() => setFilter(undefined)} />{cities.map(item => <Chip key={`${item.country}:${item.city}`} label={`${item.city}, ${item.country}`} selected={filter?.city === item.city && filter.country === item.country} onPress={() => { setFilter(item); setCity(item.city); setCountry(item.country); }} />)}</ChipRow>
    <View style={{ gap: 8 }}><Field label="City" value={city} onChangeText={setCity} maxLength={200} /><Field label="Country code (e.g. FR)" value={country} onChangeText={setCountry} maxLength={2} /><Button label="Explore city" disabled={!city.trim() || !/^[a-z]{2}$/i.test(country)} onPress={() => setFilter({ city: city.trim(), country: country.toUpperCase() })} /></View>
    {filter && <><SectionHeading title={`Trending in ${filter.city}`} /><ResourceStatus {...trending} />
      {trending.data && <><T variant="small" muted>Souvenir activity · computed {trending.data.computedAt ?? 'unavailable'}. Recent collectors compared with the previous eight-week baseline.</T>
        {trending.data.places.map(place => <PlaceRow key={place.id} place={mapPlace(place)} subtitle={frequencyLabel(place.metrics)} />)}
        {!trending.data.places.length && <T muted>No trending destinations with enough activity in this city yet.</T>}</>}
    </>}
    <SectionHeading title={filter ? `Places in ${filter.city}` : 'Global destinations'} /><AccountCatalog city={filter?.city} country={filter?.country} />
    <SectionHeading title="Explore sets" /><AccountSets />
  </Screen>;
}
