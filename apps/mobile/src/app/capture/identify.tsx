import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, View } from 'react-native';
import { Button, DemoLabel, Screen, T } from '@/components/ui';
import { PlacePhoto } from '@/components/cards/PlacePhoto';
import { identifyAfterDelay } from '@/domain/capture';
import { useApp } from '@/state/AppProvider';
import { CaptureHeader } from '@/features/capture/CaptureHeader';
import { CaptureUnavailable } from '@/features/capture/Unavailable';
import { captureStyles } from '@/features/capture/styles';
import { useCaptureMotion } from '@/features/capture/useCaptureMotion';

export default function IdentifyCapture() {
  const { state, commit } = useApp();
  const [draft] = useState(state.captureDraft);
  const reducedMotion = useCaptureMotion();
  const [scan] = useState(() => new Animated.Value(0));
  const request = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    if (!draft || draft.status !== 'identify') return;
    if (state.mode === 'account') {
      void commit({ type: 'DRAFT', draft: { ...draft, status: 'confirm' } }).then(() => router.replace('/capture/confirm')).catch(() => setMessage('Could not open the draft. Retry while connected.'));
      return;
    }
    const sequence = ++request.current;
    const controller = new AbortController();
    const animation = reducedMotion ? undefined : Animated.loop(Animated.sequence([
      Animated.timing(scan, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(scan, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    animation?.start();
    const subscription = AppState.addEventListener('change', status => { if (status !== 'active') { controller.abort(); setMessage('Identification paused while Souvenir was in the background.'); } });
    void identifyAfterDelay(draft, state.preferences.identifyFailure, controller.signal).then(async result => {
      if (controller.signal.aborted || sequence !== request.current) return;
      await commit({ type: 'DRAFT', draft: { ...draft, placeId: result.selectedId, status: 'confirm' } });
      if (!controller.signal.aborted && sequence === request.current) router.replace({ pathname: '/capture/confirm', params: { candidates: result.candidates.join(','), note: result.reason } });
    }).catch(() => { if (!controller.signal.aborted) setMessage('Identification could not finish. Your draft is preserved; retry or choose a place manually.'); });
    return () => { controller.abort(); animation?.stop(); subscription.remove(); };
  }, [attempt, commit, draft, scan, state.preferences.identifyFailure, state.mode, reducedMotion]);
  if (!draft || draft.status !== 'identify') return <CaptureUnavailable />;
  return <Screen>
    <CaptureHeader title="Finding a place" onPause={() => { ++request.current; setMessage('Identification paused. Retry when you are ready, or choose a place manually.'); }} />
    <View><PlacePhoto placeId={draft.placeId ?? ''} uri={draft.photoUri} style={captureStyles.photoRounded} />{!reducedMotion && <Animated.View pointerEvents="none" style={[captureStyles.scanLine, { transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [24, 250] }) }] }]} />}</View>
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}><T variant="heading">Finding a place</T><T muted style={{ textAlign: 'center' }}>Comparing your capture with deterministic fixture context. No pixels are sent anywhere.</T><DemoLabel label="Demo identification" /></View>
    {message && <View style={captureStyles.notice}><T>{message}</T><Button label="Try identification again" variant="outline" onPress={() => { setMessage(undefined); setAttempt(value => value + 1); }} /></View>}
    <Button label="Choose place manually" variant="ghost" onPress={async () => { ++request.current; await commit({ type: 'DRAFT', draft: { ...draft, placeId: undefined, status: 'confirm' } }); router.replace('/capture/confirm'); }} />
  </Screen>;
}
