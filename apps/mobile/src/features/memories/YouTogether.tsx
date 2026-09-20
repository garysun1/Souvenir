import { router } from 'expo-router';
import { useState } from 'react';
import type { TasteComparisonDto, TasteSharedProfileDto } from '../../../../../shared/memories-contract';
import { Button, Field, SectionHeading, T } from '@/components/ui';
import { interestLabel } from '@/domain/memories';
import { useMemoryResource } from '@/lib/useMemories';
import { queryString } from '@/lib/worldwide';
import { useApp } from '@/state/AppProvider';
import { ResourceStatus } from '@/features/discovery/AccountPlaceDetail';
import { Card, MemoryPhoto } from './MemoryUi';

export function YouTogether({ userId }: { userId: string }) {
  const { mergePlaces } = useApp();
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [filter, setFilter] = useState<{ city?: string; country?: string }>({});
  const profile = useMemoryResource<TasteSharedProfileDto>(`/api/users/${encodeURIComponent(userId)}/taste`);
  const comparison = useMemoryResource<TasteComparisonDto>(`/api/users/${encodeURIComponent(userId)}/taste-comparison?${queryString(filter)}`);
  return <><SectionHeading title="You together" />
    <T muted>Based only on interests you have both approved for friends. This does not predict friendship quality.</T>
    <ResourceStatus {...profile} />
    {profile.data && !profile.error && <Card><T variant="heading">{profile.data.published.title ?? 'Shared taste'}</T>
      {profile.data.published.facets.map(facet => <T key={`${facet.interest}:${facet.intent}`}>{interestLabel(facet.interest)} · {facet.intent.replace(/_/g, ' ')} · {facet.strength}/3</T>)}
      {profile.data.published.collageMomentIds.map(id => <MemoryPhoto key={id} path={`/api/moments/${id}/photo`} label="Friend-approved collage photo" />)}
    </Card>}
    <Field label="Suggestion city (optional)" value={city} maxLength={200} onChangeText={setCity} />
    <Field label="Country code (optional, e.g. US)" value={country} maxLength={2} onChangeText={setCountry} autoCapitalize="characters" />
    <Button label="Update suggestions" variant="outline" disabled={!!country && !/^[a-z]{2}$/i.test(country)} onPress={() => setFilter({ city: city.trim() || undefined, country: country.trim().toUpperCase() || undefined })} />
    <ResourceStatus {...comparison} />
    {comparison.data && !comparison.error ? <Card>
      <T variant="heading">{comparison.data.commonInterests.length ? `Your common ground: ${comparison.data.commonInterests.map(interestLabel).join(', ')}` : 'No common approved interests yet'}</T>
      <T>{comparison.data.explanation}</T><T variant="small" muted>Coverage: {comparison.data.coverage} · overlap: {comparison.data.overlap} · definition v{comparison.data.definitionVersion}</T>
      {comparison.data.suggestions.map(suggestion => <Card key={suggestion.place.id}>
        <T variant="place">{suggestion.place.name}</T><T>{suggestion.reason}</T>
        <T variant="small" muted>Matches: {suggestion.matchedInterests.map(interestLabel).join(', ')}. Check the destination for known or unknown hours, cost and availability.</T>
        <Button label="View place, save or plan" variant="outline" onPress={() => { mergePlaces([suggestion.place]); router.push({ pathname: '/place/[placeId]', params: { placeId: suggestion.place.id } }); }} />
      </Card>)}
      {!comparison.data.suggestions.length && <T muted>No matching catalog suggestions in this area.</T>}
    </Card> : !comparison.loading && <T muted>Both people need published friends profiles and an accepted friendship. Private or removed profiles are not compared.</T>}
  </>;
}
