import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, ChipRow, Field, Header, Screen, T } from '@/components/ui';
import { localDate, parseBudgetCents, parseMinute, validCalendarDate } from '@/domain/planner';
import type { Plan } from '@/domain/types';
import { placeById, places } from '@/fixtures/catalog';
import { useApp } from '@/state/AppProvider';
import { suggestedStops } from '../../../../../shared/journey';

export function AccountPlanner({ context }: { context: { placeIds?: string; wishlistId?: string; planId?: string } }) {
  const { state, commit } = useApp();
  const base = state.plans.find(plan => plan.id === context.planId);
  const list = state.wishlists.find(item => item.id === (base?.wishlistId ?? context.wishlistId));
  const [title, setTitle] = useState(base?.title ?? list?.title ?? 'An afternoon out');
  const [date, setDate] = useState(base?.constraints.date ?? localDate(new Date().toISOString()));
  const [time, setTime] = useState('14:00');
  const [duration, setDuration] = useState('60');
  const [travel, setTravel] = useState('15');
  const [cost, setCost] = useState('0');
  const [selected, setSelected] = useState<string[]>(base?.stops.map(stop => stop.placeId) ?? [...new Set(context.placeIds?.split(',') ?? (list ? suggestedStops(list, 'you', 30) : []))].filter(id => !!placeById(id)).slice(0, 30));
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef<Plan | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  if (context.planId && (!base || base.createdBy !== 'you')) return <Screen><Header title="Plan unavailable" back /><T>Only the plan creator can revise it.</T></Screen>;
  const save = async () => {
    setMessage('');
    try {
      if (context.wishlistId && !list) throw new Error('This shared list is unavailable. Open a list you belong to before planning together.');
      if (!pending.current) {
        const start = parseMinute(time); const visit = Number(duration); const transit = Number(travel); const cents = parseBudgetCents(cost);
        if (!title.trim() || !validCalendarDate(date) || start === null || !selected.length || selected.length > 30 || !Number.isInteger(visit) || visit < 1 || !Number.isInteger(transit) || transit < 0 || cents === null) throw new Error('Choose places, a valid date/time and nonnegative estimates. Visit time must be at least one minute.');
        const end = start + selected.length * (visit + transit);
        if (end > 1440) throw new Error('These stops run past midnight. Reduce stops or duration.');
        const requestId = randomUUID();
        pending.current = {
          id: base?.id ?? requestId, requestId: base?.requestId ?? requestId, title: title.trim(), version: (base?.version ?? 0) + 1,
          status: 'accepted', createdAt: new Date().toISOString(), provenance: 'manual', wishlistId: list?.id,
          constraints: { participantIds: list?.memberIds ?? ['you'], date, startMinute: start, endMinute: end, budgetCents: cents * selected.length, transport: 'walk', interests: [...new Set(selected.map(id => placeById(id)!.category))], rain: false, excludedPlaceIds: [], preferredPlaceIds: selected },
          stops: selected.map((placeId, index) => ({ placeId, arrivalMinute: start + index * (visit + transit) + transit, departureMinute: start + (index + 1) * (visit + transit), travelMinutes: transit, costCents: cents })),
          totalCostCents: cents * selected.length, totalMinutes: end - start,
          checks: ['User-entered schedule and cost estimates. Hours, access, travel, weather and ticket availability have not been verified. Zero cost is a user estimate, not verified free admission.'],
        };
        setLocked(true);
      }
      const plan = pending.current;
      const next = await commit(base ? { type: 'UPDATE_PLAN', plan } : { type: 'ACCEPT_PLAN', plan });
      const saved = next.plans.find(item => base ? item.id === base.id : item.requestId === plan.requestId);
      if (!saved) throw new Error('The save could not be confirmed. Refresh or retry the same plan.');
      router.replace({ pathname: '/plans/[planId]', params: { planId: saved.id } });
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'The plan could not be saved. Retry while connected.'); }
  };
  return <Screen><Header back title={base ? 'Revise your plan' : 'Plan an afternoon'} />
    <View style={{ gap: 16 }}>
      <T muted>Choose catalog places and enter your own estimates. Venue hours, travel, prices and weather are unknown. This does not reserve or book anything.</T>
      {list && <T>Members of {list.title} can see this saved plan.</T>}
      <Field label="Plan title" value={title} onChangeText={setTitle} editable={!locked} maxLength={200} />
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} editable={!locked} />
      <Field label="Start time at your destinations (HH:MM)" value={time} onChangeText={setTime} editable={!locked} />
      <Field label="Estimated minutes at each stop" value={duration} onChangeText={setDuration} editable={!locked} keyboardType="numeric" />
      <Field label="Estimated walking minutes before each stop" value={travel} onChangeText={setTravel} editable={!locked} keyboardType="numeric" />
      <Field label="Your estimated dollars per stop (not verified admission)" value={cost} onChangeText={setCost} editable={!locked} keyboardType="decimal-pad" />
      <T variant="label">Stops in order</T>
      {selected.map((id, index) => <Button key={id} disabled={locked} label={`${index + 1}. ${placeById(id)?.name ?? 'Unavailable'} · Remove`} variant="outline" onPress={() => setSelected(ids => ids.filter(item => item !== id))} />)}
      <Field label="Find a destination" value={query} onChangeText={setQuery} editable={!locked} />
      <ChipRow>{places.filter(place => !selected.includes(place.id) && place.name.toLowerCase().includes(query.toLowerCase())).map(place => <Chip key={place.id} label={place.name} onPress={locked ? undefined : () => setSelected(ids => [...ids, place.id])} />)}</ChipRow>
      {!!message && <T accessibilityRole="alert">{message}</T>}
      {locked && <T muted>The submitted plan is held unchanged for retry. After it is saved, use Revise to change it.</T>}
      <Button label={locked ? 'Retry save' : base ? 'Save revision' : 'Accept plan'} onPress={save} />
      <Button label="Saved plans" variant="outline" onPress={() => router.push('/plans')} />
    </View>
  </Screen>;
}
