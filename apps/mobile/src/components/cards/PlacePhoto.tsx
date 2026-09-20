import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { placeImages } from '@/fixtures/images';
import { colors } from '@/design/tokens';
import { Button, Icon, T } from '@/components/ui';
import { samplePlaceId } from '@/domain/capture';
import { placeById } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { resolveMedia, releaseMedia } from '@/platform/media';
import { safeWebUrl } from '@/lib/worldwide';
export function PlacePhoto({ placeId, uri, style, children }: { placeId: string; uri?: string; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const { state, signedPhoto } = useApp();
  const [resolved, setResolved] = useState<{ id: string; uri?: string }>();
  const [failed, setFailed] = useState<string>();
  const [privatePhoto, setPrivatePhoto] = useState<{ identity: string; url: string; expiresAt: string }>();
  const [retry, setRetry] = useState(0);
  const lastRetry = useRef(0);
  const identity = uri ?? placeId;
  const edition = state.mode === 'account' && uri ? state.editions.find(item => item.photoUri === uri && item.photoPath) : undefined;
  const photoExpiresAt = privatePhoto?.identity === identity ? privatePhoto.expiresAt : edition?.photoExpiresAt;
  const editionId = edition?.id;
  useEffect(() => {
    if (!editionId || !photoExpiresAt) return;
    const immediate = lastRetry.current !== retry;
    lastRetry.current = retry;
    let active = true;
    const timer = setTimeout(() => {
      void signedPhoto(editionId).then(photo => {
        if (active) { setPrivatePhoto({ identity, url: photo.url, expiresAt: photo.expiresAt }); setFailed(undefined); }
      }).catch(() => { if (active) setFailed(identity); });
    }, immediate ? 0 : Math.max(0, Date.parse(photoExpiresAt) - Date.now() - 15000));
    return () => { active = false; clearTimeout(timer); };
  }, [editionId, photoExpiresAt, signedPhoto, identity, retry]);
  useEffect(() => {
    if (!uri?.startsWith('media:')) return;
    let active = true; let objectUri: string | undefined;
    void resolveMedia(uri).then(value => { objectUri = value; if (active) setResolved({ id: uri, uri: value }); else releaseMedia(value); });
    return () => { active = false; releaseMedia(objectUri); };
  }, [uri]);
  const sample = samplePlaceId(uri);
  const place = placeById(placeId);
  const hero = !uri && place?.canonical ? place.images?.find(image => image.url === place.heroImageUrl) : undefined;
  const localUri = uri?.startsWith('media:') ? resolved?.id === uri ? resolved.uri : undefined : privatePhoto?.identity === identity ? privatePhoto.url : uri;
  const source = failed === identity ? undefined : sample && state.mode !== 'account' ? placeImages[sample] : uri ? localUri ? { uri: localUri } : undefined : state.mode === 'account' || place?.canonical ? (place?.heroImageUrl ? { uri: place.heroImageUrl } : undefined) : placeImages[placeId];
  const loading = uri?.startsWith('media:') && resolved?.id !== uri;
  return <View style={[{ backgroundColor: colors.brandSoft, overflow: 'hidden', borderRadius: 12 }, style]}>
    {source ? <Image source={source} cachePolicy={edition || place?.canonical ? 'none' : 'disk'} contentFit="cover" transition={180} onError={() => { setFailed(identity); if (edition && !retry) setRetry(1); }} style={{ width: '100%', height: '100%', position: 'absolute' }} accessibilityLabel={uri && !sample ? 'Personal visit photograph' : 'Destination photograph'} /> : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12 }}><Icon name="image" size={32} /><T variant="small" muted>{loading ? 'Loading your photo…' : uri && !sample ? 'Personal photo unavailable' : 'Photo unavailable'}</T>{uri && !sample && !loading && <T variant="small" muted style={{ textAlign: 'center' }}>Your visit details are still here.</T>}{edition && <Button label="Retry photo" variant="ghost" onPress={() => setRetry(value => value + 1)} />}</View>}
    {children}
    {source && hero && <Pressable accessibilityRole="link" accessibilityLabel={`Image attribution: ${hero.attribution}, ${hero.license}. Open source.`} onPress={() => { const url = safeWebUrl(hero.sourcePageUrl); if (url) void Linking.openURL(url).catch(() => undefined); }} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFFDD', padding: 3 }}><T variant="small" numberOfLines={2} style={{ fontSize: 9, lineHeight: 12 }}>{hero.attribution} · {hero.license}</T></Pressable>}
  </View>;
}
