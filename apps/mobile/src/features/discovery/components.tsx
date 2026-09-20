import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { Button, Chip, DemoLabel, Icon, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import type { Place, Category } from '@/domain/types';
import type { SearchFilters } from '@/domain/search';
import { categoryLabels } from '@/fixtures/catalog';

export function SearchLauncher({ placeholder = 'Quiet, free cultural place near us', onPress = () => router.push('/search') }: { placeholder?: string; onPress?: () => void }) {
  return <Pressable accessibilityRole="search" accessibilityLabel="Search places" onPress={onPress} style={styles.search}>
    <Icon name="search" size={19} color={colors.muted} />
    <T muted style={{ flex: 1 }} numberOfLines={1}>{placeholder}</T>
    <Icon name="arrow" size={18} />
  </Pressable>;
}

export function DiscoveryCard({ place, reason }: { place: Place; reason: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${place.name}. ${reason}`} onPress={() => router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } })} style={styles.card}>
    <PlacePhoto placeId={place.id} style={styles.photo} />
    <View style={{ gap: 3, paddingTop: 9 }}><T variant="place" numberOfLines={2}>{place.name}</T><T variant="small" muted>{place.neighborhood}</T><T variant="small" color={colors.brand} style={{ marginTop: 3 }}>{reason}</T></View>
  </Pressable>;
}

export function PlannerCard() {
  return <Pressable accessibilityRole="button" onPress={() => router.push('/planner')} style={styles.planner}>
    <View style={styles.plannerIcon}><Icon name="sparkles" /></View>
    <View style={{ flex: 1, gap: 3 }}><T variant="heading">Plan an afternoon</T><T muted>Build a sample two-stop outing around your tastes, time and budget.</T></View>
    <Icon name="chevron" size={18} />
  </Pressable>;
}

export function FilterSheet({ visible, filters, onChange, onClose }: { visible: boolean; filters: SearchFilters; onChange: (filters: SearchFilters) => void; onClose: () => void }) {
  const toggleCategory = (category: Category) => onChange({ ...filters, categories: filters.categories.includes(category) ? filters.categories.filter(item => item !== category) : [...filters.categories, category] });
  const toggleTag = (tag: string) => onChange({ ...filters, tags: filters.tags.includes(tag) ? filters.tags.filter(item => item !== tag) : [...filters.tags, tag] });
  return <Sheet visible={visible} onClose={onClose} title="Refine results">
    <View style={styles.filterGroup}><T variant="label">Category</T><View style={styles.wrap}>{(['cultural', 'park', 'landmark'] as Category[]).map(category => <Chip key={category} selected={filters.categories.includes(category)} label={categoryLabels[category]} onPress={() => toggleCategory(category)} />)}</View></View>
    <View style={styles.filterGroup}><T variant="label">Admission budget</T><View style={styles.wrap}><Chip label="Any price" selected={filters.maxPriceCents === undefined} onPress={() => { const next = { ...filters }; delete next.maxPriceCents; onChange(next); }} /><Chip label="Free" selected={filters.maxPriceCents === 0} onPress={() => onChange({ ...filters, maxPriceCents: 0 })} /><Chip label="$10 or less" selected={filters.maxPriceCents === 1000} onPress={() => onChange({ ...filters, maxPriceCents: 1000 })} /></View></View>
    <View style={styles.filterGroup}><T variant="label">Distance from starting point</T><View style={styles.wrap}><Chip label="Any distance" selected={filters.radiusKm === undefined} onPress={() => { const next = { ...filters }; delete next.radiusKm; onChange(next); }} /><Chip label="Within 3 km" selected={filters.radiusKm === 3} onPress={() => onChange({ ...filters, radiusKm: 3 })} /><Chip label="Within 8 km" selected={filters.radiusKm === 8} onPress={() => onChange({ ...filters, radiusKm: 8 })} /></View></View>
    <View style={styles.filterGroup}><T variant="label">Sample hours & tags</T><View style={styles.wrap}><Chip label="Open at demo time" selected={filters.openNow} onPress={() => onChange({ ...filters, openNow: !filters.openNow })} />{['quiet', 'art', 'garden', 'outdoors', 'indoors'].map(tag => <Chip key={tag} label={tag[0].toUpperCase() + tag.slice(1)} selected={filters.tags.includes(tag)} onPress={() => toggleTag(tag)} />)}</View></View>
    <DemoLabel label="Filters apply to bundled sample catalog data" />
    <Button label="Show results" onPress={onClose} />
  </Sheet>;
}

const styles = StyleSheet.create({
  search: { minHeight: 52, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { width: '48%', minWidth: 0 }, photo: { height: 156, width: '100%', borderRadius: 10 },
  planner: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 25 },
  plannerIcon: { height: 46, width: 46, borderRadius: 23, backgroundColor: colors.brandSoft, justifyContent: 'center', alignItems: 'center' },
  filterGroup: { gap: 9 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
