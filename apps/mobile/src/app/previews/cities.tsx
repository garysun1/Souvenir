import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Chip, Header, Icon, Screen, T } from '@/components/ui';
import { colors } from '@/design/tokens';
const cities = [
  { name: 'Los Angeles', description: '30 places · Your current edition', state: 'open' },
  { name: 'San Francisco', description: 'Fog, murals, gardens, and neighborhood icons', state: 'preview' },
  { name: 'New York', description: 'Small cultural rituals across five boroughs', state: 'preview' },
  { name: 'Tokyo', description: 'Quiet discoveries and everyday design', state: 'preview' },
];
export default function CitiesPreview() {
  return <Screen><Header title="City editions" back /><T variant="title">A little world,{'\n'}city by city.</T><T muted style={{ marginTop: 10 }}>Los Angeles is the only available catalog in this prototype. These previews do not download data or change your collection.</T>
    <View style={{ marginTop: 24, gap: 12 }}>{cities.map(city => <View key={city.name} style={{ borderWidth: 1, borderColor: city.state === 'open' ? colors.brand : colors.border, borderRadius: 16, padding: 18, gap: 10, backgroundColor: city.state === 'open' ? colors.brandSoft : '#fff' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: city.state === 'open' ? colors.brand : colors.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={city.state === 'open' ? 'pin' : 'globe'} color={city.state === 'open' ? '#fff' : colors.brand} /></View><View style={{ flex: 1 }}><T variant="heading">{city.name}</T><T variant="small" muted>{city.description}</T></View><Chip label={city.state === 'open' ? 'Available' : 'Concept'} selected={city.state === 'open'} /></View>
      {city.state === 'open' && <Button label="Keep exploring LA" variant="outline" onPress={() => router.replace('/discover')} />}
    </View>)}</View>
    <Button label="Close preview" variant="ghost" onPress={() => router.back()} style={{ marginTop: 18 }} />
  </Screen>;
}
