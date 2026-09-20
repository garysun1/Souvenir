import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Button, DemoLabel, Icon, Screen, Sheet, T } from '@/components/ui';
import { useApp } from '@/state/AppProvider';
import type { CaptureDraft } from '@/domain/types';
import { exifSuggestion, newCaptureId, samplePhoto } from '@/domain/capture';
import { placeById } from '@/fixtures/catalog';
import { persistMedia } from '@/platform/media';
import { CaptureHeader } from '@/features/capture/CaptureHeader';
import { CaptureUnavailable } from '@/features/capture/Unavailable';
import { captureStyles } from '@/features/capture/styles';

const value = (input?: string | string[]) => Array.isArray(input) ? input[0] : input;
export default function Capture() {
  const params = useLocalSearchParams<{ placeId?: string; outingId?: string; planId?: string }>();
  const { state, commit } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const saving = useRef(false);
  const taking = useRef(false);
  const active = useRef(true);
  const pendingDraft = useRef<{ rawUri: string; draft: CaptureDraft } | undefined>(undefined);
  const [cameraReady, setCameraReady] = useState(false);
  const [available, setAvailable] = useState<boolean>();
  const [flash, setFlash] = useState(false);
  const [resume, setResume] = useState(() => !!state.captureDraft);
  const [error, setError] = useState<string>();
  const [pendingUri, setPendingUri] = useState<string>();
  const requestedPlaceId = value(params.placeId);
  const requestedOutingId = value(params.outingId);
  const requestedPlanId = value(params.planId);
  const place = requestedPlaceId ? placeById(requestedPlaceId) : undefined;
  const outing = requestedOutingId ? state.outings.find(item => item.id === requestedOutingId) : requestedPlanId ? state.outings.find(item => item.planId === requestedPlanId) : undefined;
  const contextValid = (!requestedPlaceId || !!place) && (!requestedOutingId || !!outing)
    && (!requestedPlanId || !!outing && outing.planId === requestedPlanId);
  useEffect(() => { active.current = true; void CameraView.isAvailableAsync().then(value => { if (active.current) setAvailable(value); }).catch(() => { if (active.current) setAvailable(false); }); return () => { active.current = false; }; }, []);
  if (!contextValid) return <CaptureUnavailable message="The place or outing used to start this capture is unavailable." />;
  const routeFor = (draft: CaptureDraft) => `/capture/${draft.status === 'saved' ? 'reveal' : draft.status === 'photo' ? 'identify' : draft.status}` as '/capture/identify';
  const makeDraft = (photoUri: string | undefined, status: CaptureDraft['status']): CaptureDraft => ({ id: newCaptureId(), photoUri, placeId: place?.id, timezone: state.mode === 'account' ? place?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC' : undefined, visitedAt: state.mode === 'account' ? new Date().toISOString() : state.clock, companions: state.mode === 'account' ? [] : outing?.participantIds.filter(id => id !== 'you') ?? [], moment: '', outingId: outing?.id, status });
  const savePhoto = async (rawUri: string, alreadyPersistent = false, suggestion?: ReturnType<typeof exifSuggestion>) => {
    if (saving.current) return;
    if (state.captureDraft && state.captureDraft.status !== 'saved') { setResume(true); return; }
    saving.current = true; setError(undefined); setPendingUri(rawUri);
    try {
      const work = pendingDraft.current?.rawUri === rawUri ? pendingDraft.current.draft : makeDraft(undefined, 'identify');
      if (state.mode !== 'account' && suggestion?.visitedAt) work.visitedAt = suggestion.visitedAt;
      if (state.mode !== 'account' && !place && suggestion?.placeId) work.placeId = suggestion.placeId;
      pendingDraft.current = { rawUri, draft: work };
      const uri = alreadyPersistent ? rawUri : await persistMedia(rawUri);
      if (!active.current) return;
      await commit({ type: 'DRAFT', draft: { ...work, photoUri: uri } });
      if (!active.current) return;
      setPendingUri(undefined); pendingDraft.current = undefined;
      router.replace('/capture/identify');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The photo could not be saved. Your existing draft was not changed.'); }
    finally { saving.current = false; }
  };
  const takePhoto = async () => {
    if (!camera.current || !cameraReady || taking.current) return;
    taking.current = true;
    try { const photoResult = await camera.current.takePictureAsync({ quality: 0.82 }); if (active.current && photoResult?.uri) await savePhoto(photoResult.uri); }
    catch { setError('The camera could not take that photo. Retry, choose from your gallery, or use a sample.'); }
    finally { taking.current = false; }
  };
  const choosePhoto = () => {
    const openPicker = async () => { try {
      if (Platform.OS !== 'web') {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted && permissionResult.status === 'denied') { setError('Gallery access is off. Allow photos in Settings, or use a sample.'); return; }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.9, exif: true });
      if (active.current && !result.canceled && result.assets[0]?.uri) await savePhoto(result.assets[0].uri, false, exifSuggestion(result.assets[0].exif));
    } catch { setError('The photo library could not open. Your existing draft is still safe.'); } };
    // Some web browsers never resolve a canceled picker. Do not leave a button busy.
    if (Platform.OS === 'web') { void openPicker(); return; }
    return openPicker();
  };
  const beginManual = async () => { if (state.captureDraft && state.captureDraft.status !== 'saved') { setResume(true); return; } const draft = makeDraft(undefined, 'confirm'); await commit({ type: 'DRAFT', draft }); router.replace('/capture/confirm'); };
  return <Screen>
    <CaptureHeader title="Capture a moment" />
    {place && <View style={captureStyles.notice}><T variant="label">Visiting {place.name}</T><T variant="small" muted>The place context will be suggested for confirmation.</T></View>}
    {error && <View style={captureStyles.error}><T variant="label" color="#A3383C">Photo not added</T><T>{error}</T>{pendingUri && <Button label="Retry saving photo" variant="outline" onPress={() => savePhoto(pendingUri)} />}</View>}
    {permission?.granted && available ? <View style={captureStyles.camera}>
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" flash={flash ? 'on' : 'off'} onCameraReady={() => setCameraReady(true)} onMountError={() => setError('Camera preview is unavailable. You can still choose or sample a photo.')} />
      <View style={captureStyles.cameraControls}><Pressable accessibilityRole="button" accessibilityLabel={flash ? 'Turn flash off' : 'Turn flash on'} onPress={() => setFlash(current => !current)} style={captureStyles.roundControl}><Icon name="sparkles" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Take photo" accessibilityState={{ disabled: !cameraReady }} disabled={!cameraReady} onPress={() => void takePhoto()} style={captureStyles.shutterOuter}><View style={captureStyles.shutterInner} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Choose from gallery" onPress={() => void choosePhoto()} style={captureStyles.roundControl}><Icon name="image" /></Pressable></View>
    </View> : <View style={[captureStyles.camera, { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 }]}><Icon name="camera" size={46} color="#fff" /><T variant="heading" color="#fff" style={{ textAlign: 'center' }}>{available === false ? 'No camera found' : permission?.status === 'denied' ? 'Camera access is off' : 'Ready when you are'}</T><T color="#E4ECEE" style={{ textAlign: 'center' }}>{available === false ? 'Choose a photo, use the catalog-only path, or try the sample.' : 'Camera permission is requested only when you choose to enable it.'}</T>{available !== false && permission?.canAskAgain !== false && <Button label={permission?.status === 'denied' ? 'Retry camera permission' : 'Enable camera'} variant="outline" onPress={requestPermission} />}{permission?.status === 'denied' && permission.canAskAgain === false && <Button label="Open device settings" variant="outline" onPress={() => Linking.openSettings()} />}</View>}
    <View style={{ gap: 10, marginTop: 18 }}><Button label="Choose from gallery" variant="outline" icon="image" onPress={choosePhoto} />{state.mode !== 'account' && <Button label={`Use sample photo${place ? ` · ${place.name}` : ''}`} variant="outline" icon="sparkles" onPress={() => savePhoto(samplePhoto(place?.id ?? 'la-the-broad'), true)} />}<Button label="Continue without a photo" variant="ghost" onPress={beginManual} /></View>
    <DemoLabel label={state.mode === 'account' ? 'Choose the destination yourself. Photos upload privately when saved.' : 'Photos are not analyzed. Identification is a deterministic demo.'} />
    <Sheet visible={resume} onClose={() => setResume(false)} title="Your capture is waiting">
      <T muted>Continue your saved draft, or discard it before starting this one.</T>
      <Button label={state.captureDraft?.status === 'saved' ? 'Open saved reveal' : 'Resume draft'} onPress={() => { const draft = state.captureDraft; setResume(false); if (draft) router.replace(routeFor(draft)); }} />
      <Button label="Discard and start over" variant="outline" onPress={async () => { await commit({ type: 'DRAFT', draft: null }); setResume(false); }} />
    </Sheet>
  </Screen>;
}
