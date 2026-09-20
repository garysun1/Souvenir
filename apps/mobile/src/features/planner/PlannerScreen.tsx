import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AvatarStack, Button, Chip, DemoLabel, Field, Header, Icon, Screen, SectionHeading, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { acceptedPlan, minuteLabel, parsePlannerPrompt, planAfternoon, plannerEnvironment, resolvePlannerContext, restoredConstraints, revisionSummary, SUGGESTED_PROMPT, type PlannerConstraints, type PlannerResult, type Proposal } from '@/domain/planner';
import { placeById, users } from '@/fixtures/catalog';
import { PLANNER_ORIGIN_LABEL } from '@/fixtures/travel';
import { useApp } from '@/state/AppProvider';
import { visitDate } from '@/state/selectors';
import { ConstraintEditor } from './ConstraintEditor';
import { dollars, Itinerary, Notice, PlanRoute, plannerStyles, proposalSnapshot, Unavailable } from './components';

const progressLabels = ['Matching everyone’s tastes', 'Checking sample hours & ticket requirements', 'Checking sample weather', 'Estimating travel & cost', 'Preparing proposal'];
let requestSequence = 0;
interface Run { id: string; constraints: PlannerConstraints }
interface CompletedRun { id: string; result: PlannerResult; environmentKey: string }
export function PlannerScreen({ sessionId, context }: { sessionId: string; context: { placeIds?: string; participantIds?: string; wishlistId?: string; planId?: string } }) {
  const { state, commit } = useApp();
  const resolved = useMemo(() => resolvePlannerContext(state, context), [state, context]);
  const basePlan = context.planId ? state.plans.find(plan => plan.id === context.planId) : undefined;
  const [constraints, setConstraints] = useState<PlannerConstraints>(() => basePlan ? { ...restoredConstraints(basePlan.constraints), lockedPlaceIds: [] } : resolved.constraints);
  const [prompt, setPrompt] = useState(SUGGESTED_PROMPT);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [editor, setEditor] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [stage, setStage] = useState(0);
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [previous, setPrevious] = useState<Proposal | null>(() => basePlan ? proposalSnapshot(basePlan) : null);
  const [changes, setChanges] = useState<string[]>([]);
  const [sheet, setSheet] = useState<'why' | 'map' | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [notice, setNotice] = useState('');
  const [accepting, setAccepting] = useState(false);
  const currentRequest = useRef<string | null>(null);
  const environment = useMemo(() => plannerEnvironment(state), [state.preferences.sourceStatus, state.preferences.tastes, state.wishlists]); // eslint-disable-line react-hooks/exhaustive-deps
  const environmentKey = JSON.stringify(environment);
  const result = completed?.result;
  const proposal = result?.status === 'feasible' ? result.proposal : null;
  const dirty = !!proposal && (JSON.stringify(proposal.constraints) !== JSON.stringify(constraints) || completed?.environmentKey !== environmentKey);
  const needsTimedEntryAck = !!proposal?.stops.some(stop => placeById(stop.placeId)?.bookingRequired);

  useEffect(() => {
    if (!run) return;
    const timers = progressLabels.map((_, index) => setTimeout(() => {
      if (currentRequest.current === run.id) setStage(index);
    }, index * 550));
    timers.push(setTimeout(() => {
      if (currentRequest.current !== run.id) return;
      const nextResult = planAfternoon(run.constraints, environment);
      setCompleted({ id: run.id, result: nextResult, environmentKey });
      if (nextResult.status === 'feasible' && previous) setChanges(revisionSummary(previous, nextResult.proposal));
      setRun(null); currentRequest.current = null;
    }, 2800));
    return () => timers.forEach(clearTimeout);
  }, [run, environment, environmentKey, previous]);

  function cancel(message = 'Planning canceled. Your constraints and any accepted plans are unchanged.') {
    currentRequest.current = null; setRun(null); setNotice(message);
  }
  function build(next: PlannerConstraints) {
    if (proposal) setPrevious(proposal);
    setConstraints(next); setChanges([]); setAcknowledged(false); setNotice(''); setCompleted(null); setStage(0); setExpandedStage(null);
    const id = `${sessionId}-proposal-${++requestSequence}`;
    currentRequest.current = id; setRun({ id, constraints: next });
  }
  function submitPrompt() {
    if (!prompt.trim()) { setNotice('Write a prompt or use the editable constraints below.'); return; }
    const parsed = parsePlannerPrompt(prompt, constraints, state.clock);
    setConstraints(parsed.constraints); setUnknown(parsed.unknown);
    if (parsed.unknown.length) { cancel('Choose your constraints explicitly below. Unsupported prompt details have not been applied.'); return; }
    build(parsed.constraints);
  }
  function revise(patch: Partial<PlannerConstraints>) {
    setUnknown([]); build({ ...constraints, ...patch });
  }
  async function accept() {
    if (!proposal || !completed || dirty || accepting || (needsTimedEntryAck && !acknowledged)) return;
    // Recheck the current source state before persisting; no unconditional feasibility claim survives a source failure.
    const rechecked = planAfternoon(proposal.constraints, plannerEnvironment(state));
    if (rechecked.status !== 'feasible') { setCompleted({ ...completed, result: rechecked }); return; }
    setAccepting(true);
    try {
      const plan = acceptedPlan(proposal, completed.id, state.clock, (basePlan?.version ?? 0) + 1);
      const next = await commit({ type: 'ACCEPT_PLAN', plan });
      const saved = next.plans.find(item => item.requestId === plan.requestId);
      if (!saved) { setNotice('The plan could not be found after saving. Please retry.'); return; }
      router.push({ pathname: '/plans/[planId]', params: { planId: saved.id } });
    } catch { setNotice('Could not save this plan. Retry acceptance; the same request will not create duplicates.'); }
    finally { setAccepting(false); }
  }
  const invalid = !/^draft-\d+$/.test(sessionId) ? 'This draft link is not valid. Start a fresh plan.' : context.planId && !basePlan ? 'The plan you wanted to revise is unavailable.' : resolved.error;
  if (invalid) return <Screen><Header title="Plan an afternoon" back /><Unavailable message={invalid} /></Screen>;

  const details = [
    `${(run?.constraints ?? constraints).participantIds.map(id => users.find(user => user.id === id)?.name).join(' + ')}. Each pair is ranked by the least-matched person’s category tastes, with small shared-save boosts. Preferred stops are not guaranteed.`,
    'Curated sample hours, full visits, 10-minute buffers, and Broad timed-entry slots. The Broad is closed in the Sep 21 sample. No ticket lookup or booking occurs.',
    `Sample ${(run?.constraints ?? constraints).rain ? 'rain: indoor visits only' : 'dry afternoon'}; source status: ${state.preferences.sourceStatus}. Unknown/stale sources block a checked proposal.`,
    `${(run?.constraints ?? constraints).transport} sample matrix from Downtown LA. Costs are integer cents per person; transit is $1.75 per leg, without transfer discounts.`,
    'Enumerate ordered two-stop pairs. Keep every hard constraint, compare valid pairs, then break ties by duration and stable place IDs. This is local deterministic code, not an AI provider call.',
  ];
  return <Screen>
    <Header title="Plan an afternoon" back right={<Button label="Saved" variant="ghost" onPress={() => router.push('/plans')} />} />
    <View style={plannerStyles.stack}>
      <DemoLabel label="Sample planner · no AI calls or reservations" />
      {state.preferences.offline && <Notice title="Offline demo"><T variant="small">Bundled samples still work. No live weather, tickets, or directions are requested.</T></Notice>}
      {basePlan && <Notice title={`Revising version ${basePlan.version}`}><T variant="small">The original accepted plan stays saved. Accepting this revision creates a separate new version.</T></Notice>}
      {resolved.wishlistTitle && <T variant="small" muted>From “{resolved.wishlistTitle}” · list members and preferred places carried into the form.</T>}
      <Field label="What would you like to do?" multiline value={prompt} onChangeText={setPrompt} placeholder={SUGGESTED_PROMPT} />
      <Button label="Use prompt & find a plan" icon="sparkles" onPress={submitPrompt} disabled={!!run} />
      <T variant="small" muted>Supports two visits, dollar budgets, people’s names, HH:MM–HH:MM, YYYY-MM-DD, walk/transit, interests and rain/dry. Other details need an explicit form choice.</T>
      {unknown.length > 0 && <View style={plannerStyles.error}><T variant="label" color={colors.error}>Please resolve the unsupported details</T><T>“{unknown.join(', ')}” was not understood. Edit the constraints below; we will not silently assume these requests were met.</T><Button label="Choose constraints explicitly" variant="outline" onPress={() => setEditor(true)} /><Button label="Use only the displayed constraints" variant="outline" onPress={() => { setUnknown([]); build(constraints); }} /></View>}
      <View style={plannerStyles.summary}>
        <View style={plannerStyles.row}><AvatarStack ids={constraints.participantIds} /><T variant="label" style={{ flex: 1 }}>{constraints.participantIds.map(id => users.find(user => user.id === id)?.name).join(' + ')}</T></View>
        <T variant="small" muted>{PLANNER_ORIGIN_LABEL}</T>
        <T>{visitDate(`${constraints.date}T12:00:00Z`)} · {minuteLabel(constraints.startMinute)}–{minuteLabel(constraints.endMinute)} LA</T>
        <T>{dollars(constraints.budgetCents)}/person · {constraints.transport} · {constraints.rain ? 'Rain / indoor' : 'Dry sample'}</T>
        <T variant="small" muted>Interests: {constraints.interests.join(', ')}. {constraints.returnToOrigin ? 'Return included.' : 'Finish at last stop.'}</T>
        <T variant="small" muted>Preferred: {constraints.preferredPlaceIds.map(id => placeById(id)?.name).join(', ') || 'No preference'}.</T>
        {constraints.excludedPlaceIds.length > 0 && <T variant="small" muted>Excluded: {constraints.excludedPlaceIds.map(id => placeById(id)?.name).join(', ')}.</T>}
        {constraints.assumeTimedEntry && <T variant="small" muted>Timed-entry sample availability assumed, never booked. You must acknowledge this before accepting a ticketed proposal.</T>}
        <Button label="Change constraints" variant="outline" onPress={() => { cancel(''); setEditor(true); }} />
        <Button label={proposal ? 'Recalculate these constraints' : 'Build from these constraints'} variant="ghost" disabled={!!run || unknown.length > 0} onPress={() => build(constraints)} />
      </View>
      {!!notice && <Notice title="Planner update"><T accessibilityLiveRegion="polite">{notice}</T></Notice>}
      {run && <View style={plannerStyles.summary}>
        <T variant="heading">Building your sample plan</T><T variant="small" muted>Simulated tool steps · about 3 seconds. Tap a step to inspect the inputs.</T>
        {progressLabels.map((label, index) => <View key={label}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedStage === index }} onPress={() => setExpandedStage(expandedStage === index ? null : index)} style={[plannerStyles.row, { minHeight: 48 }]}>
            {index === stage ? <ActivityIndicator color={colors.brand} size="small" /> : <Icon name={index < stage ? 'check' : 'clock'} size={18} color={index < stage ? colors.brand : colors.muted} />}
            <T variant="small" accessibilityLiveRegion={index === stage ? 'polite' : undefined} style={{ flex: 1 }}>{label}{index === stage ? '…' : ''}</T><Icon name="down" size={15} />
          </Pressable>{expandedStage === index && <T variant="small" muted>{details[index]}</T>}
        </View>)}
        <Button label="Cancel planning" variant="outline" onPress={() => cancel()} />
      </View>}
      {result && result.status !== 'feasible' && <View style={plannerStyles.error}>
        <T variant="heading">{result.status === 'unknown' ? 'We can’t check this plan yet' : 'No two-stop plan fits'}</T>
        {result.reasons.map(reason => <T key={reason}>{reason}</T>)}
        <T variant="small" muted>No constraints were relaxed. {result.evaluatedPairs} ordered pairs evaluated.</T>
        {result.suggestions.map(suggestion => <T key={suggestion} variant="small" muted>{suggestion}</T>)}
        <Button label="Edit constraints" variant="outline" onPress={() => setEditor(true)} />
        <Button label="Try a full afternoon" variant="outline" onPress={() => revise({ startMinute: 840, endMinute: 1080 })} />
        <Button label="Explore one experience instead" variant="ghost" onPress={() => router.push('/discover')} />
        {result.status === 'unknown' && <Button label="Review demo source settings" variant="outline" onPress={() => router.push('/settings/demo')} />}
      </View>}
      {proposal && <>
        <SectionHeading title="Your two-stop afternoon" />
        <Notice title={dirty ? 'Constraints changed · recalculate first' : 'Fits the selected sample constraints'}><T variant="small">{dirty ? 'This earlier proposal cannot be accepted until it is recalculated.' : `Budget, date, hours, visits, travel, weather and sample access checked. ${result?.evaluatedPairs} ordered pairs considered. Not live-verified.`}</T></Notice>
        {changes.length > 0 && <Notice title="What changed">{changes.map(change => <T variant="small" key={change}>{change}</T>)}</Notice>}
        <Itinerary {...proposal} onReplace={placeId => revise({ excludedPlaceIds: [...new Set([...constraints.excludedPlaceIds, placeId])], lockedPlaceIds: proposal.stops.filter(stop => stop.placeId !== placeId).map(stop => stop.placeId) })} />
        <View style={plannerStyles.row}><Button label="Why this plan?" variant="outline" style={{ flex: 1 }} onPress={() => setSheet('why')} /><Button label="View map" variant="outline" style={{ flex: 1 }} onPress={() => setSheet('map')} /></View>
        {needsTimedEntryAck && <Notice title="Timed entry is an assumption, not a ticket"><T variant="small">The Broad needs timed entry. The displayed sample slot is assumed available. We have not checked ticket inventory or made a reservation.</T><Chip label="I understand: sample entry, no booking" selected={acknowledged} onPress={() => setAcknowledged(value => !value)} /></Notice>}
        <Button label={basePlan ? 'Accept revised plan' : 'Accept plan'} onPress={accept} loading={accepting} disabled={dirty || (needsTimedEntryAck && !acknowledged)} />
        <T variant="small" muted>Acceptance saves locally and creates an outing. It does not book, invite friends, pay, or add stops to anyone’s wishlist.</T>
      </>}
      {!run && (result || previous) && <>
        <SectionHeading title="Try a revision" />
        <View style={plannerStyles.chips}>
          <Chip label="$10/person" onPress={() => revise({ budgetCents: 1000 })} />
          <Chip label={constraints.rain ? 'Dry weather' : 'Rain instead'} onPress={() => revise({ rain: !constraints.rain })} />
          <Chip label="Only 16:30–17:00" onPress={() => revise({ startMinute: 990, endMinute: 1020 })} />
          <Chip label="Broad unavailable" onPress={() => revise({ excludedPlaceIds: [...new Set([...constraints.excludedPlaceIds, 'la-the-broad'])], lockedPlaceIds: constraints.lockedPlaceIds.filter(id => id !== 'la-the-broad') })} />
          <Chip label={constraints.transport === 'walk' ? 'Take transit' : 'Walk instead'} onPress={() => revise({ transport: constraints.transport === 'walk' ? 'transit' : 'walk' })} />
          <Chip label={constraints.participantIds.includes('maya') ? 'Without Maya' : 'Include Maya'} onPress={() => revise({ participantIds: constraints.participantIds.includes('maya') ? constraints.participantIds.filter(id => id !== 'maya') : [...constraints.participantIds, 'maya'] })} />
        </View>
      </>}
      <T variant="small" muted>Drafts last for this screen. Accepted plans persist on this device. Current demo clock: {new Date(state.clock).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false })} LA.</T>
    </View>
    {editor && <ConstraintEditor constraints={constraints} onClose={() => setEditor(false)} onApply={next => { setEditor(false); setUnknown([]); build(next); }} />}
    <Sheet visible={sheet === 'why'} title="Why this sample plan?" onClose={() => setSheet(null)}>
      {proposal && <><T>We maximize the least-matched participant’s category taste score, then consider preferred stops, shared saves and category variety. Shorter feasible itineraries and stable IDs break ties.</T>{Object.entries(proposal.reasons).map(([id, reason]) => <View key={id} style={{ gap: 4 }}><T variant="place">{placeById(id)?.name}</T><T>{reason}</T></View>)}{proposal.checks.map(check => <T key={check}>{check}</T>)}{proposal.warnings.map(warning => <T muted key={warning}>{warning}</T>)}</>}
    </Sheet>
    <Sheet visible={sheet === 'map'} title="Your route, at a glance" onClose={() => setSheet(null)}>{proposal && <PlanRoute stops={proposal.stops} onNavigate={() => setSheet(null)} />}</Sheet>
  </Screen>;
}
