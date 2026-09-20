import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Field, SectionHeading, Sheet, T } from '@/components/ui';
import { colors } from '@/design/tokens';
import { minuteLabel, parseBudgetCents, parseMinute, validCalendarDate, type PlannerConstraints } from '@/domain/planner';
import { categoryLabels, places, users } from '@/fixtures/catalog';
import { PLANNER_ORIGIN_LABEL } from '@/fixtures/travel';
import { plannerStyles } from './components';

export function ConstraintEditor({ constraints, onClose, onApply }: { constraints: PlannerConstraints; onClose: () => void; onApply: (constraints: PlannerConstraints) => void }) {
  const [draft, setDraft] = useState(constraints);
  const [budget, setBudget] = useState((constraints.budgetCents / 100).toFixed(2));
  const [start, setStart] = useState(minuteLabel(constraints.startMinute));
  const [end, setEnd] = useState(minuteLabel(constraints.endMinute));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const toggle = (key: 'participantIds' | 'excludedPlaceIds' | 'preferredPlaceIds', id: string) => setDraft(old => ({ ...old, [key]: old[key].includes(id) ? old[key].filter(value => value !== id) : [...old[key], id] }));
  const apply = () => {
    const budgetCents = parseBudgetCents(budget); const startMinute = parseMinute(start); const endMinute = parseMinute(end);
    if (budgetCents === null) { setError('Enter a nonnegative budget with at most two decimal places, such as 25 or 10.50.'); return; }
    if (!validCalendarDate(draft.date)) { setError('Enter a real calendar date as YYYY-MM-DD.'); return; }
    if (startMinute === null || endMinute === null || endMinute <= startMinute) { setError('Use 24-hour HH:MM times, with an end after the start.'); return; }
    if (!draft.interests.length) { setError('Select at least one interest.'); return; }
    onApply({ ...draft, budgetCents, startMinute, endMinute });
  };
  return <Sheet visible title="Your afternoon, your terms" onClose={onClose}>
    <T muted>Edits never relax a hard constraint. Updating the form does not replace an accepted plan.</T>
    <T variant="label">People</T>
    <View style={plannerStyles.chips}>{users.map(user => <Chip key={user.id} label={user.id === 'you' ? 'You · always included' : user.name} selected={draft.participantIds.includes(user.id)} onPress={user.id === 'you' ? undefined : () => toggle('participantIds', user.id)} />)}</View>
    <T variant="label">Start location</T><T muted>{PLANNER_ORIGIN_LABEL}. This demo has one starting point; it does not use device location.</T>
    <Field label="Local date · YYYY-MM-DD" value={draft.date} onChangeText={date => setDraft(old => ({ ...old, date }))} autoCapitalize="none" />
    <T variant="small" muted>America/Los_Angeles · operational sample coverage Sep 19–26, 2026.</T>
    <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Field label="Start · HH:MM" value={start} onChangeText={setStart} placeholder="14:00" /></View><View style={{ flex: 1 }}><Field label="Finish by · HH:MM" value={end} onChangeText={setEnd} placeholder="18:00" /></View></View>
    <View style={plannerStyles.chips}><Chip label="14:00–18:00" onPress={() => { setStart('14:00'); setEnd('18:00'); }} /><Chip label="16:30–17:00" onPress={() => { setStart('16:30'); setEnd('17:00'); }} /></View>
    <Field label="Budget per person · USD" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" />
    <T variant="small" muted>Admission + transport only. Party total scales with people. No meals or optional purchases.</T>
    <T variant="label">Transport</T><View style={plannerStyles.chips}><Chip label="Walk" selected={draft.transport === 'walk'} onPress={() => setDraft(old => ({ ...old, transport: 'walk' }))} /><Chip label="Transit · $1.75/leg" selected={draft.transport === 'transit'} onPress={() => setDraft(old => ({ ...old, transport: 'transit' }))} /></View>
    <T variant="small" muted>Separate authored time matrices. Transit includes sample waits. Driving has no fixture and is not supported.</T>
    <T variant="label">Interests · used to rank, not silently exclude</T>
    <View style={plannerStyles.chips}>{(['cultural', 'park', 'landmark'] as const).map(category => <Chip key={category} label={categoryLabels[category]} selected={draft.interests.includes(category)} onPress={() => setDraft(old => ({ ...old, interests: old.interests.includes(category) ? old.interests.filter(item => item !== category) : [...old.interests, category] }))} />)}</View>
    <T variant="label">Weather scenario</T><View style={plannerStyles.chips}><Chip label="Dry" selected={!draft.rain} onPress={() => setDraft(old => ({ ...old, rain: false }))} /><Chip label="Rain · indoor visits" selected={draft.rain} onPress={() => setDraft(old => ({ ...old, rain: true }))} /></View>
    <Chip label="Include return to starting point" selected={draft.returnToOrigin} onPress={() => setDraft(old => ({ ...old, returnToOrigin: !old.returnToOrigin }))} />
    <Chip label="Require sample step-free venue access" selected={draft.stepFree} onPress={() => setDraft(old => ({ ...old, stepFree: !old.stepFree }))} />
    <T variant="small" muted>Step-free venue samples are not verified accessibility advice. Transfer-route accessibility is not checked.</T>
    <Chip label="Assume sample timed entry is available" selected={draft.assumeTimedEntry} onPress={() => setDraft(old => ({ ...old, assumeTimedEntry: !old.assumeTimedEntry }))} />
    <T variant="small" muted>The Broad requires timed entry. This switch only permits its authored sample slots; it never books a ticket. Turn it off to exclude venues needing an unconfirmed reservation.</T>
    {draft.lockedPlaceIds.length > 0 && <Button label="Unlock the retained stop" variant="outline" onPress={() => setDraft(old => ({ ...old, lockedPlaceIds: [] }))} />}
    <SectionHeading title="Preferred & unavailable" />
    <T variant="small" muted>Preferred stops get a taste-ranking boost, not a guarantee. Excluded stops are a hard constraint.</T>
    <Field label="Find a destination" value={search} onChangeText={setSearch} placeholder="Search the sample catalog" />
    {places.filter(place => place.name.toLowerCase().includes(search.toLowerCase())).map(place => <View key={place.id} style={{ gap: 8, borderBottomWidth: 1, borderColor: colors.divider, paddingBottom: 12 }}><T variant="place">{place.name}</T><View style={plannerStyles.chips}>
      <Chip label="Prefer" selected={draft.preferredPlaceIds.includes(place.id)} onPress={() => toggle('preferredPlaceIds', place.id)} />
      <Chip label="Exclude / unavailable" selected={draft.excludedPlaceIds.includes(place.id)} onPress={() => toggle('excludedPlaceIds', place.id)} />
    </View></View>)}
    {!places.some(place => place.name.toLowerCase().includes(search.toLowerCase())) && <T muted>No matching destination. Clear the search to see the sample catalog.</T>}
    {!!error && <T accessibilityRole="alert" color={colors.error}>{error}</T>}
    <Button label="Use these constraints" onPress={apply} />
    <Button label="Cancel edits" variant="ghost" onPress={onClose} />
  </Sheet>;
}
