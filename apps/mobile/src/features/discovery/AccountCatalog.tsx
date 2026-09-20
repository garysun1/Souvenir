import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Category, PlaceDto } from '../../../../../shared/api-contract';
import type { NearbyDto } from '../../../../../shared/worldwide-contract';
import { Button, Chip, ChipRow, Field, T } from '@/components/ui';
import { PlaceRow } from '@/components/cards/PlaceRow';
import { mapPlace } from '@/lib/bootstrap';
import { queryString, type SearchHit } from '@/lib/worldwide';
import { useApp } from '@/state/AppProvider';
import { requestDiscoveryLocation } from '@/platform/location';

export function AccountCatalog({ initialQuery = '', city, country, onChoose }: {
  initialQuery?: string; city?: string; country?: string; onChoose?: (id: string) => void;
}) {
  const { accountPage, accountRequest, mergePlaces, accountRevision } = useApp();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<Category>();
  const [location, setLocation] = useState<{ lat: number; lng: number }>();
  const [locationError, setLocationError] = useState<string>();
  const [page, setPage] = useState<{ key?: string; data: PlaceDto[]; cursor?: string | null; coverage?: string }>({ data: [] });
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const pagePath = `/api/places?${queryString({ q: query.trim(), city, country, category, limit: 50 })}`;
  const requestKey = JSON.stringify([pagePath, location, accountRevision, attempt]);
  useEffect(() => {
    const id = ++generation.current;
    const timer = setTimeout(() => {
      setPage({ key: requestKey, data: [] }); setLoading(true); setError(undefined);
      const read = async () => {
        if (location && !query.trim()) {
          const nearby = await accountRequest<NearbyDto>(`/api/places/nearby?${queryString({ ...location, radiusM: 5000, category, country, limit: 50 })}`);
          return { data: nearby.places.map(hit => hit.place).filter(place => !city || place.city === city), coverage: `${nearby.provenance} · coverage ${nearby.coverage} · within 5 km${city ? ` · ${city}` : ''}` };
        }
        const [result, search] = await Promise.all([
          accountPage<PlaceDto[]>(pagePath),
          query.trim() ? accountRequest<SearchHit[]>('/api/search', 'POST', { q: query.trim(), category, limit: 50 }) : Promise.resolve([]),
        ]);
        const matches = search.map(hit => hit.place).filter(place => (!city || place.city === city) && (!country || place.country === country));
        return { data: [...new Map([...matches, ...result.data].map(place => [place.id, place])).values()], cursor: result.nextCursor };
      };
      void read().then(result => {
        if (id !== generation.current) return;
        mergePlaces(result.data); setPage({ ...result, key: requestKey }); setLoading(false);
      }).catch(reason => { if (id === generation.current) { setError(reason instanceof Error ? reason.message : 'Search failed.'); setLoading(false); } });
    }, 300);
    return () => { generation.current = id + 1; clearTimeout(timer); };
  }, [pagePath, location, query, category, city, country, accountPage, accountRequest, mergePlaces, requestKey]);
  const more = async () => {
    if (!page.cursor || loading) return;
    const id = generation.current;
    setLoading(true); setError(undefined);
    try {
      const next = await accountPage<PlaceDto[]>(`${pagePath}&cursor=${encodeURIComponent(page.cursor)}`);
      if (id !== generation.current) return;
      mergePlaces(next.data);
      setPage(previous => ({ key: requestKey, data: [...new Map([...previous.data, ...next.data].map(place => [place.id, place])).values()], cursor: next.nextCursor }));
    } catch (reason) { if (id === generation.current) setError(reason instanceof Error ? reason.message : 'Could not load more.'); }
    finally { if (id === generation.current) setLoading(false); }
  };
  const current = page.key === requestKey;
  return <View style={{ gap: 10 }}>
    <Field label="Search destinations" value={query} onChangeText={setQuery} placeholder="Name or description" maxLength={200} />
    <ChipRow>{(['nature', 'culture', 'food', 'landmark', 'hidden_gem'] as const).map(value => <Chip key={value} label={value.replace('_', ' ')} selected={category === value} onPress={() => setCategory(category === value ? undefined : value)} />)}</ChipRow>
    <Button label={location ? 'Clear nearby location' : 'Use my location for nearby places'} variant="outline" onPress={async () => {
      if (location) { setLocation(undefined); return; }
      const id = generation.current;
      const result = await requestDiscoveryLocation();
      if (id !== generation.current) return;
      if (result.device) { setLocation({ lat: result.origin.latitude, lng: result.origin.longitude }); setQuery(''); setLocationError(undefined); }
      else setLocationError('Location unavailable or denied. Search by name or retry location.');
    }} />
    {locationError && <T accessibilityRole="alert">{locationError}</T>}
    <T variant="small" muted>{location && !query.trim() ? page.coverage ?? 'Finding nearby catalog places…' : `Global catalog${city ? ` · ${city}, ${country}` : ''}`}. {onChoose ? 'Tap a place to choose it; confirm your visit on the next screen.' : 'Hours and prices remain unknown unless documented.'}</T>
    {(loading || !current) && <ActivityIndicator accessibilityLabel="Loading destinations" />}
    {current && error && <><T accessibilityRole="alert">{error}</T><Button label="Retry search" onPress={() => setAttempt(value => value + 1)} /></>}
    {current && !loading && !error && !page.data.length && <T muted>No destinations found. Try a broader search or add a place in Capture.</T>}
    {current && page.data.map(place => <PlaceRow key={place.id} place={mapPlace(place)} subtitle={[place.city, place.country, place.source].filter(Boolean).join(' · ')} onPress={onChoose ? () => onChoose(place.id) : undefined} />)}
    {current && page.cursor && <Button label="More destinations" loading={loading} variant="outline" onPress={more} />}
  </View>;
}
