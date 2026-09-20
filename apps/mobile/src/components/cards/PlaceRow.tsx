import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import type { Place } from '@/domain/types';
import { T, Icon } from '@/components/ui';
import { categoryLabels } from '@/fixtures/catalog';
import { colors } from '@/design/tokens';
import { PlacePhoto } from './PlacePhoto';
import { money } from '@/state/selectors';
export function PlaceRow({ place, subtitle, trailing, onPress }: { place: Place; subtitle?: string; trailing?: ReactNode; onPress?: () => void }) {
  return <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={onPress ?? (() => router.push({ pathname: '/place/[placeId]', params: { placeId: place.id } }))} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <PlacePhoto placeId={place.id} style={{ width: 64, height: 68, borderRadius: 8 }} />
      <View style={{ flex: 1, gap: 3 }}><T variant="place">{place.name}</T><T variant="small" muted>{place.neighborhood} · {money(place.priceCents)}</T><T variant="small" muted>{subtitle ?? categoryLabels[place.category]}</T></View>
    </Pressable>{trailing ?? <Icon name="chevron" size={17} color="#999999" />}
  </View>;
}
