import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Field, Icon, Sheet, T } from '@/components/ui';
import { categoryLabels, placeById } from '@/fixtures/catalog';
import { searchCapturePlaces } from '@/domain/capture';
import { captureStyles } from './styles';

export function PlaceSearchSheet({ visible, onClose, onChoose, candidateIds = [] }: { visible: boolean; onClose: () => void; onChoose: (id: string) => void; candidateIds?: string[] }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => query.trim() ? searchCapturePlaces(query) : candidateIds.map(placeById).filter((place): place is NonNullable<ReturnType<typeof placeById>> => !!place), [candidateIds, query]);
  return <Sheet visible={visible} onClose={onClose} title="Choose the place">
    <Field label="Search the catalog" value={query} onChangeText={setQuery} autoFocus placeholder="Name or neighborhood" returnKeyType="search" />
    {!query.trim() && !results.length && <T muted>Start typing to search all 30 Los Angeles places.</T>}
    {!!query.trim() && !results.length && <T muted>No catalog places match “{query}.” Try a neighborhood or a shorter name.</T>}
    <View style={{ gap: 8 }}>{results.slice(0, 12).map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => { onChoose(place.id); setQuery(''); onClose(); }} style={captureStyles.choice}>
      <Icon name="pin" /><View style={{ flex: 1 }}><T variant="place">{place.name}</T><T variant="small" muted>{categoryLabels[place.category]} · {place.neighborhood}</T></View><Icon name="chevron" />
    </Pressable>)}</View>
  </Sheet>;
}
