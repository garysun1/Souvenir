import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Button, DemoLabel, Header, Icon, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { advanceDemoDay, formatDemoClock } from '@/domain/sources';
import type { Action, Preferences, SourceStatus } from '@/domain/types';
import { useApp } from '@/state/AppProvider';
import { clearMedia } from '@/platform/media';

type ToggleKey = 'offline' | 'reducedMotion' | 'identifyFailure';
const statusOptions: { value: SourceStatus; title: string; description: string }[] = [
  { value: 'sample', title: 'Bundled sample', description: 'Restore the local fixture values. Nothing is fetched or verified.' },
  { value: 'stale', title: 'Simulate stale source', description: 'Hours and weather are not checked. Previous hours remain labeled sample, never “Open”.' },
  { value: 'unavailable', title: 'Simulate unavailable source', description: 'Hide unsupported operational facts. Keep the catalog and personal memories.' },
];

export default function DemoScreen() {
  const { state, commit } = useApp();
  const [resetMode, setResetMode] = useState<'sample' | 'empty' | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const latestVisit = state.editions.filter(edition => edition.ownerId === 'you').sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))[0];
  const persist = async (action: Action, success: string) => {
    if (working.current) return false;
    working.current = true; setBusy(true); setFailure(''); setMessage('');
    try { await commit(action); setMessage(success); return true; }
    catch { setFailure('Could not save this change. Your previous data is intact. Please try again.'); return false; }
    finally { working.current = false; setBusy(false); }
  };
  const patch = (preferences: Partial<Preferences>, success: string) => persist({ type: 'PREFERENCES', patch: preferences }, success);
  const toggle = (key: ToggleKey, value: boolean) => { void patch({ [key]: value }, 'Demo preference saved.'); };
  const advance = async () => {
    try { await persist({ type: 'CLOCK', clock: advanceDemoDay(state.clock) }, 'Demo clock advanced by one local day. Existing visits and plans have not changed.'); }
    catch { setFailure('The demo clock could not be advanced. Reset the demo to restore its starting time.'); }
  };
  const reset = async () => {
    if (!resetMode) return;
    if (!await persist({ type: 'RESET', mode: resetMode }, resetMode === 'sample' ? 'Sample collection restored. All demo controls and the clock were reset.' : 'Empty album ready. The destination catalog and fictional friends are still here.')) return;
    try { await clearMedia(); }
    catch { setFailure('The collection was reset, but a few app-owned photo copies may remain in local storage. They are no longer linked to your profile.'); }
    setResetMode(null);
  };
  return <Screen>
    <Header title="Demo controls" back subtitle="Try another version of the afternoon." />
    <DemoLabel label="Changes are saved only on this installation" />
    {message !== '' && <View style={styles.notice}><T accessibilityLiveRegion="polite">{message}</T></View>}
    {failure !== '' && <T accessibilityRole="alert" color={colors.error} style={{ marginTop: 16 }}>{failure}</T>}
    <SectionHeading title="The demo clock" />
    <View style={styles.clock}>
      <Icon name="clock" /><View style={styles.grow}><T variant="label">{formatDemoClock(state.clock)}</T><T variant="small" muted>America/Los_Angeles · simulated time</T></View>
    </View>
    <T muted style={{ marginBottom: 14 }}>The clock starts on September 19, 2026 at 2:00 PM. Advancing it makes a revisit possible without changing your earlier visits. Real photo dates and location do not silently move it.</T>
    <Button label="Advance one day" icon="clock" variant="outline" disabled={busy} onPress={advance} />
    <SectionHeading title="Service & display" />
    <ToggleRow title="Offline demonstration" description="Use bundled experiences and the schematic map. This does not disconnect your device or block the external browser." value={state.preferences.offline} disabled={busy} onChange={value => toggle('offline', value)} />
    <ToggleRow title="Reduced-motion preview" description="Save the shared reduced-motion preference for supported app animations." value={state.preferences.reducedMotion} disabled={busy} onChange={value => toggle('reducedMotion', value)} />
    <ToggleRow title="Simulate identification failure" description="The capture flow uses its failure state so you can recover with manual place selection." value={state.preferences.identifyFailure} disabled={busy} onChange={value => toggle('identifyFailure', value)} />
    <SectionHeading title="Source status" />
    <T muted>One shared simulation applies across the prototype. Unavailable facts never become zeros. NPS remains not applicable in every mode.</T>
    {statusOptions.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: state.preferences.sourceStatus === option.value, disabled: busy }} disabled={busy} onPress={() => { void patch({ sourceStatus: option.value }, `${option.title} selected.`); }} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surface }]}>
      <View style={[styles.radio, state.preferences.sourceStatus === option.value && { borderColor: colors.brand }]}>{state.preferences.sourceStatus === option.value && <View style={styles.dot} />}</View>
      <View style={styles.grow}><T variant="label">{option.title}</T><T variant="small" muted>{option.description}</T></View>
    </Pressable>)}
    <Button label="Inspect data sources" variant="ghost" onPress={() => router.push('/settings/sources')} />
    <SectionHeading title="Try the connected flows" />
    <View style={{ gap: 12 }}>
      <Button label="Camera-free capture" variant="outline" icon="camera" onPress={() => router.push('/capture')} />
      <T variant="small" muted>Choose “Use sample photo” in capture. No camera permission is needed for a bundled sample.</T>
      <Button label="Revisit a collected place" variant="outline" disabled={!latestVisit || busy} onPress={() => { if (latestVisit) router.push({ pathname: '/capture', params: { placeId: latestVisit.placeId } }); }} />
      <T variant="small" muted>{latestVisit ? 'Advance the clock above, then capture another edition of your most recent place.' : 'Collect a place first, or restore the sample collection, to try a revisit.'}</T>
      <Button label="Plan a shared outing" variant="outline" icon="people" onPress={() => router.push({ pathname: '/planner', params: { wishlistId: 'saturday-maya', participantIds: 'you,maya' } })} />
      <T variant="small" muted>Opens the shared planner with Maya. Review and accept a plan there; this shortcut does not invent an accepted outing.</T>
    </View>
    <SectionHeading title="Start again" />
    <T muted>Reset replaces this prototype’s local profile, visits, saves, rankings, drafts, plans and preferences. It restores the clock and removes app-owned photo copies. It never deletes the originals from your photo library or changes anyone else’s data.</T>
    <View style={{ gap: 12, marginTop: 16 }}>
      <Button label="Reset to sample collection" variant="outline" disabled={busy} onPress={() => { setFailure(''); setResetMode('sample'); }} />
      <Button label="Reset to empty album" variant="outline" disabled={busy} onPress={() => { setFailure(''); setResetMode('empty'); }} />
      <T variant="small" muted>Current starting mode: {state.mode === 'sample' ? 'Sample collection' : 'Empty album'}. Your changes stay saved until you confirm a reset.</T>
    </View>
    <Sheet visible={resetMode !== null} title={resetMode === 'sample' ? 'Restore the sample collection?' : 'Start with an empty album?'} onClose={() => { if (!busy) setResetMode(null); }}>
      <T>This replaces your local prototype progress and cannot be undone. Any unsaved capture or import draft will be discarded.</T>
      <T muted>{resetMode === 'sample' ? 'You will start with six collected places and seven editions, plus the connected sample friends and lists.' : 'Your album, rankings, saves and plans will be empty. The catalog and fictional friends remain available.'}</T>
      <T variant="small" muted>The demo clock and all service/display preferences return to their defaults. App-owned photo copies are removed; original photos in your library are not deleted.</T>
      {failure !== '' && <T accessibilityRole="alert" color={colors.error}>{failure}</T>}
      <Button label={resetMode === 'sample' ? 'Replace with sample collection' : 'Replace with empty album'} loading={busy} onPress={reset} />
      <Button label="Keep my current data" variant="outline" disabled={busy} onPress={() => setResetMode(null)} />
    </Sheet>
  </Screen>;
}

function ToggleRow({ title, description, value, disabled, onChange }: { title: string; description: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.toggle}><View style={styles.grow}><T variant="label">{title}</T><T variant="small" muted>{description}</T></View><Switch accessibilityLabel={title} accessibilityHint={description} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.brand }} /></View>;
}
const styles = StyleSheet.create({
  grow: { flex: 1, gap: 5 }, notice: { backgroundColor: colors.brandSoft, borderRadius: 12, padding: 16, marginTop: 18 },
  clock: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 17, borderRadius: 12, backgroundColor: colors.surface, marginBottom: 14 },
  toggle: { flexDirection: 'row', gap: 14, alignItems: 'center', minHeight: 76, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.divider },
  option: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 72, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.divider },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 10, width: 10, borderRadius: 5, backgroundColor: colors.brand },
});
