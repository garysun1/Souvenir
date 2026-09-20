import { useState } from 'react';
import { View } from 'react-native';
import type { CollectionFilters } from '@/domain/collection';
import { defaultCollectionFilters, validDay } from '@/domain/collection';
import { categoryLabels, users } from '@/fixtures/catalog';
import { Button, Chip, ChipRow, Field, Sheet, T } from '@/components/ui';
import type { Category } from '@/domain/types';
import { useApp } from '@/state/AppProvider';

export function filtersActive(filters: CollectionFilters) { return JSON.stringify(filters) !== JSON.stringify(defaultCollectionFilters); }
export function CollectionFilterBar({ filters, onChange }: { filters: CollectionFilters; onChange: (filters: CollectionFilters) => void }) {
  const { state } = useApp();
  const companions = state.mode === 'account' ? [...new Set(state.editions.flatMap(edition => edition.companions))].map(name => ({ id: name, name })) : users.filter(user => user.id !== 'you');
  const [open, setOpen] = useState(false); const [draft, setDraft] = useState(filters); const [dateError, setDateError] = useState('');
  const categoryLabel = filters.category === 'all' ? 'Category' : categoryLabels[filters.category];
  return <>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><ChipRow><Chip label={categoryLabel} selected={filters.category !== 'all'} icon="down" onPress={() => { setDraft(filters); setOpen(true); }} /><Chip label="Favorites" icon="heart" selected={filters.favorites} onPress={() => onChange({ ...filters, favorites: !filters.favorites })} /><Chip label={filters.companion ? `With ${companions.find(user => user.id === filters.companion)?.name ?? filters.companion}` : 'Companion'} icon="people" selected={!!filters.companion} onPress={() => { setDraft(filters); setOpen(true); }} /><Chip label="Visit date" icon="clock" selected={!!filters.after || !!filters.before} onPress={() => { setDraft(filters); setOpen(true); }} /><Chip label={`Sort: ${filters.sort === 'recent' ? 'Recent' : filters.sort === 'name' ? 'Name' : 'Your rank'}`} icon="down" selected={filters.sort !== 'recent'} onPress={() => { setDraft(filters); setOpen(true); }} /></ChipRow></View>{filtersActive(filters) && <Button label="Clear" variant="ghost" onPress={() => onChange(defaultCollectionFilters)} />}</View>
    <Sheet visible={open} onClose={() => setOpen(false)} title="Filter collection">
      <T variant="label">Category</T><ChipRow>{(['all', 'cultural', 'park', 'landmark', 'food', 'hidden_gem'] as const).map(category => <Chip key={category} label={category === 'all' ? 'All' : categoryLabels[category]} selected={draft.category === category} onPress={() => setDraft({ ...draft, category: category as Category | 'all' })} />)}</ChipRow>
      <T variant="label">Companion</T><ChipRow><Chip label="Anyone" selected={!draft.companion} onPress={() => setDraft({ ...draft, companion: '' })} />{companions.map(user => <Chip key={user.id} label={user.name} selected={draft.companion === user.id} onPress={() => setDraft({ ...draft, companion: user.id })} />)}</ChipRow>
      <View style={{ gap: 12 }}><Field label="Visited on or after" placeholder="YYYY-MM-DD" value={draft.after} onChangeText={after => setDraft({ ...draft, after })} /><Field label="Visited on or before" placeholder="YYYY-MM-DD" value={draft.before} onChangeText={before => setDraft({ ...draft, before })} />{dateError && <T color="#A3383C">{dateError}</T>}</View>
      <T variant="label">Sort</T><ChipRow>{(['recent', 'name', 'ranking'] as const).map(sort => <Chip key={sort} label={sort === 'recent' ? 'Recent visit' : sort === 'name' ? 'Name' : 'Your ranking'} selected={draft.sort === sort} onPress={() => setDraft({ ...draft, sort })} />)}</ChipRow>
      <Button label="Show matching places" onPress={() => { if ((draft.after && !validDay(draft.after)) || (draft.before && !validDay(draft.before)) || (draft.after && draft.before && draft.after > draft.before)) { setDateError('Enter real dates and keep the start before the end.'); return; } setDateError(''); onChange(draft); setOpen(false); }} />
      <Button label="Clear all" variant="ghost" onPress={() => { setDraft(defaultCollectionFilters); onChange(defaultCollectionFilters); setOpen(false); }} />
    </Sheet>
  </>;
}
