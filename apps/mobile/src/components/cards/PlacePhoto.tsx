import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { placeImages } from '@/fixtures/images';
import { colors } from '@/design/tokens';
import { Icon, T } from '@/components/ui';
import { samplePlaceId } from '@/domain/capture';
import { resolveMedia, releaseMedia } from '@/platform/media';
export function PlacePhoto({ placeId, uri, style, children }: { placeId: string; uri?: string; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const [resolved, setResolved] = useState<{ id: string; uri?: string }>();
  const [failed, setFailed] = useState<string>();
  const identity = uri ?? placeId;
  useEffect(() => {
    if (!uri?.startsWith('media:')) return;
    let active = true; let objectUri: string | undefined;
    void resolveMedia(uri).then(value => { objectUri = value; if (active) setResolved({ id: uri, uri: value }); else releaseMedia(value); });
    return () => { active = false; releaseMedia(objectUri); };
  }, [uri]);
  const sample = samplePlaceId(uri);
  const localUri = uri?.startsWith('media:') ? resolved?.id === uri ? resolved.uri : undefined : uri;
  const source = failed === identity ? undefined : sample ? placeImages[sample] : uri ? localUri ? { uri: localUri } : undefined : placeImages[placeId];
  const loading = uri?.startsWith('media:') && resolved?.id !== uri;
  return <View style={[{ backgroundColor: colors.brandSoft, overflow: 'hidden', borderRadius: 12 }, style]}>
    {source ? <Image source={source} contentFit="cover" transition={180} onError={() => setFailed(identity)} style={{ width: '100%', height: '100%', position: 'absolute' }} accessibilityLabel={uri && !sample ? 'Personal visit photograph' : 'Destination photograph'} /> : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12 }}><Icon name="image" size={32} /><T variant="small" muted>{loading ? 'Loading your photo…' : uri && !sample ? 'Personal photo unavailable' : 'Photo unavailable'}</T>{uri && !sample && !loading && <T variant="small" muted style={{ textAlign: 'center' }}>Your visit details are still here.</T>}</View>}
    {children}
  </View>;
}
