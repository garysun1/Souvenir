import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { Button, DemoLabel, Header, Icon, Screen, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { visitDate } from '@/state/selectors';

export default function DioramaPreview() {
  const { editionId } = useLocalSearchParams<{ editionId?: string }>();
  const { state } = useApp();
  const [depth, setDepth] = useState(false);
  const edition = state.editions.find(item => item.id === editionId && item.ownerId === 'you');
  const place = edition && placeById(edition.placeId);
  if (!edition || !place) return <Screen><Header title="Pocket diorama" back /><T variant="heading">This memory is unavailable.</T><T muted>Open one of your own editions to preview it.</T><Button label="Open collection" onPress={() => router.replace('/collection')} /></Screen>;
  return <Screen>
    <Header title="Pocket diorama" back />
    <DemoLabel label="Visual prototype · no 3D model is generated" />
    <View style={{ height: 360, justifyContent: 'center', alignItems: 'center', marginVertical: 20 }}>
      {depth && <View style={{ position: 'absolute', width: '72%', height: 265, borderRadius: 18, backgroundColor: colors.brand, opacity: 0.11, transform: [{ translateY: 24 }, { scale: 0.93 }, { rotateZ: '-3deg' }] }} />}
      <View style={{ width: depth ? '82%' : '100%', height: depth ? 300 : 330, transform: depth ? [{ perspective: 800 }, { rotateX: '4deg' }, { rotateY: '-3deg' }] : undefined }}>
        <PlacePhoto placeId={place.id} uri={edition.photoUri} style={{ height: '100%', borderRadius: 20 }}>
          {depth && <View style={{ flex: 1, justifyContent: 'space-between', padding: 18, backgroundColor: '#071E273D' }}><View style={{ alignSelf: 'flex-end', width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFFFFFDD', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkles" /></View><View style={{ backgroundColor: '#FFFFFFEC', borderRadius: 13, padding: 14, gap: 4 }}><T variant="place">{place.name}</T><T variant="small" muted>{visitDate(edition.visitedAt, edition.timezone)} · Edition {edition.sequence}</T></View></View>}
        </PlacePhoto>
      </View>
    </View>
    <T variant="title">{depth ? 'Your memory, with a little depth.' : 'Turn one photo into a tiny scene.'}</T>
    <T muted style={{ marginVertical: 12 }}>This local preview layers your photograph and visit card to show the direction. It does not send your image to a model or create a real 3D asset.</T>
    <Button label={depth ? 'Return to original photo' : 'Preview the diorama treatment'} icon="sparkles" onPress={() => setDepth(value => !value)} />
    <Button label="Close preview" variant="ghost" onPress={() => router.back()} />
  </Screen>;
}
