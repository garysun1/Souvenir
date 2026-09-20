import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { AvatarStack, Button, DemoLabel, Icon, Screen, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { captureToEdition, editionStamp, nextOutingStop } from '@/domain/capture';
import { downtownSet, placeById } from '@/fixtures/catalog';
import { setProgress, visitDate } from '@/state/selectors';
import { useApp } from '@/state/AppProvider';
import { CaptureHeader } from '@/features/capture/CaptureHeader';
import { CaptureUnavailable } from '@/features/capture/Unavailable';
import { captureStyles } from '@/features/capture/styles';
import { useCaptureMotion } from '@/features/capture/useCaptureMotion';

export default function RevealCapture() {
  const { state, commit } = useApp();
  const draft = state.captureDraft;
  const reducedMotion = useCaptureMotion();
  const [finished, setRevealed] = useState(false);
  const revealed = finished || reducedMotion;
  const [saveError, setSaveError] = useState<string>();
  const [turn] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [sweep] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(reducedMotion ? 0.4 : 1));
  useEffect(() => {
    if (!draft || draft.status !== 'reveal') return;
    if (reducedMotion) { turn.setValue(1); Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start(); void Haptics.selectionAsync().catch(() => undefined); return; }
    const animation = Animated.sequence([
      Animated.timing(turn, { toValue: 0.5, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(turn, { toValue: 1, duration: 430, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => { if (finished) { setRevealed(true); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); Animated.timing(sweep, { toValue: 1, duration: 650, useNativeDriver: true }).start(); } });
    return () => animation.stop();
  }, [draft, fade, reducedMotion, sweep, turn]);
  if (!draft || !['reveal', 'saved'].includes(draft.status) || !draft.placeId) return <CaptureUnavailable />;
  const place = placeById(draft.placeId);
  if (!place) return <CaptureUnavailable message="The selected catalog place is unavailable." />;
  const edition = draft.editionId ? state.editions.find(item => item.id === draft.editionId) : state.editions.find(item => item.requestId === draft.id);
  if (edition) return <SavedCapture editionId={edition.id} />;
  if (draft.status === 'saved') return <CaptureUnavailable message="The edition saved from this draft is no longer available." />;
  const sequence = (state.sequences[`you:${place.id}`] ?? 0) + 1;
  const save = async () => {
    setSaveError(undefined);
    try {
      const next = await commit({ type: 'ADD_EDITION', edition: captureToEdition(draft, state.clock) });
      const saved = next.editions.find(item => item.requestId === draft.id);
      if (!saved) throw new Error('The edition was not written.');
    } catch { setSaveError('Your edition could not be saved. The reveal and draft are preserved—retry when storage is available.'); }
  };
  const backRotation = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'] });
  const frontRotation = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg'] });
  return <Screen>
    <CaptureHeader title="Your souvenir" back />
    <View style={{ minHeight: 430 }}>
      {!revealed && <Animated.View style={[captureStyles.cardBack, { transform: [{ perspective: 900 }, { rotateY: backRotation }] }]}><Icon name="sparkles" size={52} color="#fff" /><T variant="wordmark" color="#fff">souvenir</T><T color="#D9E5E6">A place worth keeping</T></Animated.View>}
      <Animated.View accessibilityLiveRegion="polite" style={[captureStyles.cardFront, !revealed && { position: 'absolute', inset: 0 }, { transform: [{ perspective: 900 }, { rotateY: frontRotation }], opacity: reducedMotion ? fade : 1 }]}>
        <PlacePhoto placeId={place.id} uri={draft.photoUri} style={captureStyles.editionPhoto} />
        <View style={{ padding: 18, gap: 8 }}><T style={captureStyles.tinyCaps}>Personal edition</T><T variant="title">{place.name}</T><View style={captureStyles.stamp}><T variant="small" color="#144F5D">{editionStamp(sequence)}</T></View><View style={[captureStyles.row, { justifyContent: 'space-between' }]}><T variant="small" muted>{visitDate(draft.visitedAt)}</T><AvatarStack ids={draft.companions} /></View>{Boolean(draft.moment) && <T muted>{draft.moment}</T>}</View>
      </Animated.View>
      {revealed && !reducedMotion && <Animated.View pointerEvents="none" style={[captureStyles.overlay, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-420, 420] }) }, { skewX: '-18deg' }], width: 90 }]} />}
    </View>
    <View style={{ gap: 10, marginTop: 22 }}><T muted style={{ textAlign: 'center' }}>The shared place stays unchanged. This photo, date, companions, and moment belong to your edition.</T>{saveError && <View style={captureStyles.error}><T color="#A3383C">{saveError}</T></View>}<Button label="Add to collection" icon="plus" onPress={save} /><Button label="Edit details" variant="ghost" onPress={() => router.replace('/capture/confirm')} /></View>
  </Screen>;
}
function SavedCapture({ editionId }: { editionId: string }) {
  const { state, commit } = useApp();
  const edition = state.editions.find(item => item.id === editionId)!;
  const place = placeById(edition.placeId)!;
  const progress = setProgress(state);
  const next = nextOutingStop(state, edition.outingId);
  const setMember = downtownSet.placeIds.includes(place.id);
  return <Screen>
    <CaptureHeader title="Added to your collection" />
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 18 }}><View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#EDF4F3', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={36} /></View><T variant="title" style={{ textAlign: 'center' }}>{place.name} is yours to revisit.</T><T muted style={{ textAlign: 'center' }}>{editionStamp(edition.sequence)} · {visitDate(edition.visitedAt)}</T></View>
    <PlacePhoto placeId={place.id} uri={edition.photoUri} style={captureStyles.photoRounded} />
    {setMember && <View style={[captureStyles.notice, { marginTop: 16 }]}><T variant="label">Downtown Firsts · {progress} of {downtownSet.placeIds.length}</T><T variant="small" muted>{progress === downtownSet.placeIds.length ? 'Set complete. Every place is counted once.' : 'Unique places move the set forward; return editions do not.'}</T></View>}
    <View style={captureStyles.actionRow}><Button label="Recommend it?" onPress={() => router.push({ pathname: '/recommend/[placeId]', params: { placeId: place.id, editionId } })} /><Button label="Open edition" variant="outline" onPress={() => router.push({ pathname: '/edition/[editionId]', params: { editionId } })} />{setMember && <Button label={progress === downtownSet.placeIds.length ? 'View completed set' : 'Complete Downtown Firsts'} variant="outline" onPress={() => router.push({ pathname: '/sets/[setId]', params: { setId: downtownSet.id } })} />}{next && <Button label={`Capture next stop · ${placeById(next)?.name ?? 'Itinerary stop'}`} variant="outline" onPress={async () => { await commit({ type: 'DRAFT', draft: null }); router.replace({ pathname: '/capture', params: { placeId: next, outingId: edition.outingId! } }); }} />}<Button label="Continue to Collection" variant="ghost" onPress={() => router.replace('/collection')} /></View>
    <DemoLabel label="Saved locally on this device" />
  </Screen>;
}
