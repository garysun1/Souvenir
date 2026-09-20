import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AvatarStack, Button, DemoLabel, Header, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { associatedEdition, localMinuteToISO, minuteLabel, missingPersonalSaves, restoredConstraints } from '@/domain/planner';
import type { PlanStop } from '@/domain/types';
import { Itinerary, Notice, PlanRoute, plannerStyles, Unavailable } from '@/features/planner/components';
import { users } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { visitDate } from '@/state/selectors';

export default function SavedPlanRoute() {
  const params = useLocalSearchParams<{ planId?: string }>();
  const planId = Array.isArray(params.planId) ? params.planId[0] : params.planId;
  const { state, commit } = useApp();
  const plan = state.plans.find(item => item.id === planId);
  const outing = state.outings.find(item => item.planId === planId);
  const [visiting, setVisiting] = useState(false);
  const [arrived, setArrived] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [checksOpen, setChecksOpen] = useState(false);
  const [savingStops, setSavingStops] = useState(false);
  if (!plan || !outing || plan.stops.some(stop => !Number.isInteger(stop.arrivalMinute))) return <Screen><Header title="Your plan" back /><Unavailable message="The saved plan or its outing could not be found. Your other saved plans are safe." /></Screen>;
  const constraints = restoredConstraints(plan.constraints);
  const completedStops = plan.stops.filter(stop => associatedEdition(state, plan.id, stop.placeId)).length;
  const unsaved = missingPersonalSaves(state, plan);
  const clockLabel = new Date(state.clock).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  async function simulateArrival(stop: PlanStop) {
    if (!plan) return;
    const clock = localMinuteToISO(plan.constraints.date, stop.arrivalMinute);
    const rewinds = Date.parse(clock) < Date.parse(state.clock);
    await commit({ type: 'CLOCK', clock });
    setArrived(old => [...new Set([...old, stop.placeId])]);
    setMessage(`${rewinds ? 'Replayed' : 'Advanced to'} the sample arrival: ${minuteLabel(stop.arrivalMinute)} Los Angeles time. Capture is now enabled for this stop. No GPS check was performed.`);
  }
  async function captureStop(stop: PlanStop) {
    if (state.mode === 'account' && plan && outing) {
      router.push({ pathname: '/capture', params: { placeId: stop.placeId, outingId: outing.id, planId: plan.id } });
      return;
    }
    if (!plan || !outing || !arrived.includes(stop.placeId)) return;
    // Persist the scheduled arrival again if another demo control changed the clock.
    // Capture reads this shared clock when creating its fresh request/draft.
    const target = localMinuteToISO(plan.constraints.date, stop.arrivalMinute);
    if (state.clock !== target) await commit({ type: 'CLOCK', clock: target });
    router.push({ pathname: '/capture', params: { placeId: stop.placeId, outingId: outing.id, planId: plan.id } });
  }
  async function saveStops() {
    if (!plan || savingStops) return;
    setSavingStops(true);
    try {
      let latest = state;
      for (const stop of plan.stops) {
        if (missingPersonalSaves(latest, plan).includes(stop.placeId)) latest = await commit({ type: 'SAVE_PLACE', placeId: stop.placeId, wishlistId: 'personal' });
      }
      setMessage('Both stops are in your personal Want to go list. Nobody else’s saves were changed.');
    } catch { setMessage('Could not save all stops. Retry to add only the remaining stops.'); }
    finally { setSavingStops(false); }
  }
  return <Screen>
    <Header title={visiting ? 'Your afternoon, unfolding' : 'Your saved afternoon'} back />
    <View style={plannerStyles.stack}>
      <DemoLabel label={state.mode === 'account' ? 'Saved account plan · estimates, no booking confirmation' : 'Accepted sample plan · no booking confirmation'} />
      <T variant="heading">{plan.title}</T>
      <View style={plannerStyles.row}><AvatarStack ids={plan.constraints.participantIds} /><T variant="small" style={{ flex: 1 }}>{plan.constraints.participantIds.map(id => users.find(user => user.id === id)?.name ?? 'Unknown participant').join(' + ')}</T></View>
      <T>{visitDate(`${plan.constraints.date}T12:00:00Z`)} · {minuteLabel(plan.constraints.startMinute)}–{minuteLabel(plan.constraints.endMinute)} LA</T>
      <T variant="label" color={colors.brand}>{plan.status === 'completed' ? 'Completed' : `${completedStops}/${plan.stops.length} stops captured`} · Version {plan.version}</T>
      <T variant="small" muted>{state.mode === 'account' ? 'Current time' : 'Demo clock'}: {clockLabel} LA. Local calendar: America/Los_Angeles.</T>
      {state.preferences.sourceStatus !== 'sample' && <Notice title="Current source checks are unavailable"><T variant="small">This saved itinerary is a snapshot of sample assumptions, not current verified feasibility. Sources are {state.preferences.sourceStatus}. Review them before planning a real visit.</T><Button label="Review sources" variant="outline" onPress={() => router.push('/settings/sources')} /></Notice>}
      {!!message && <Notice title="Plan update"><T accessibilityLiveRegion="polite">{message}</T></Notice>}
      {plan.status === 'completed' && <Notice title="An afternoon worth keeping"><T>Your own editions are linked to both outing stops. Friend editions and unrelated visits do not complete this plan.</T><Button label="Open your collection" variant="outline" onPress={() => router.push('/collection')} /></Notice>}
      {!visiting ? <Button label={plan.status === 'completed' ? 'View visit memories & map' : 'Start visit'} icon="pin" onPress={() => setVisiting(true)} /> : <Notice title={state.mode === 'account' ? 'Capture your own visits' : 'Visit mode · explicitly simulated'}><T variant="small">{state.mode === 'account' ? 'Capture each place when you visit it. Every capture creates only your own edition, linked to this outing.' : 'Simulate arrival before capture. This changes the demo clock; GPS is not checked.'}</T><Button label="Exit visit mode" variant="ghost" onPress={() => setVisiting(false)} /></Notice>}
      {visiting && <PlanRoute stops={plan.stops} />}
      <Itinerary {...plan} actions={visiting ? (stop, index) => {
        const edition = associatedEdition(state, plan.id, stop.placeId);
        const ready = state.mode === 'account' || arrived.includes(stop.placeId);
        return edition ? <View style={{ gap: 8 }}><T variant="label" color={colors.brand}>Your stop {index + 1} memory is saved</T><Button label="Open this edition" variant="outline" onPress={() => router.push({ pathname: '/edition/[editionId]', params: { editionId: edition.id } })} /></View> : <View style={{ gap: 10 }}>
          {state.mode !== 'account' && <Button label={`${ready ? 'Replay' : 'Simulate'} arrival · ${minuteLabel(stop.arrivalMinute)}`} variant="outline" onPress={() => simulateArrival(stop)} />}
          <Button label="Capture this stop" icon="camera" disabled={!ready} onPress={() => captureStop(stop)} />
          {!ready && <T variant="small" muted>Arrival must be saved first so the capture gets this plan’s local visit time.</T>}
        </View>;
      } : undefined} />
      <Button label="Review checked sample assumptions" variant="outline" onPress={() => setChecksOpen(true)} />
      <SectionHeading title="Make it yours" />
      <Button label={unsaved.length ? 'Save stops to Want to go' : 'Both stops saved to Want to go'} variant="outline" disabled={!unsaved.length} loading={savingStops} onPress={saveStops} />
      <T variant="small" muted>This is optional and changes only your personal list. The plan did not automatically save places or invite friends.</T>
      {(state.mode !== 'account' || plan.createdBy === 'you') && <Button label="Revise this plan" variant="outline" onPress={() => router.push({ pathname: '/planner', params: { planId: plan.id } })} />}
      {state.mode === 'account' && plan.createdBy === 'you' && <Button label="Delete saved plan" variant="ghost" onPress={async () => { await commit({ type: 'DELETE_PLAN', id: plan.id }); router.replace('/plans'); }} />}
      <Button label="Open shared outing" variant="ghost" onPress={() => router.push({ pathname: '/outing/[outingId]', params: { outingId: outing.id } })} />
      <T variant="small" muted>{constraints.assumeTimedEntry ? 'Timed-entry availability was explicitly assumed for the sample, not booked. ' : ''}Check real venue hours, tickets, access and weather yourself before visiting.</T>
    </View>
    <Sheet visible={checksOpen} title="Accepted sample assumptions" onClose={() => setChecksOpen(false)}>
      <T muted>These were checked against bundled fixtures when accepted. They are not live advice.</T>
      {plan.checks.map((check, index) => <T key={`${index}-${check}`}>{check}</T>)}
      <Button label="Open data sources" variant="outline" onPress={() => { setChecksOpen(false); router.push('/settings/sources'); }} />
    </Sheet>
  </Screen>;
}
