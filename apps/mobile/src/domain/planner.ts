import type { AppState, Category, Plan, PlanConstraints, PlanStop, Place, SourceStatus, User, Wishlist } from '@/domain/types';
import { places, users } from '@/fixtures/catalog';
import { ARRIVAL_BUFFER_MINUTES, PLANNER_ORIGIN, PLANNING_DATE_RANGE, sampleAccess, sampleTravel, sampleVisitMinutes, travelKey, type PlanningAccess, type TravelMatrix } from '@/fixtures/travel';
import { planningWeather, PLANNER_TIMEZONE } from '@/fixtures/weather';

export const SUGGESTED_PROMPT = 'find two experiences we will both like, this afternoon, $25/person';
export interface PlannerConstraints extends PlanConstraints {
  returnToOrigin: boolean;
  stepFree: boolean;
  assumeTimedEntry: boolean;
  lockedPlaceIds: string[];
}
export interface PlannerEnvironment {
  sourceStatus: SourceStatus;
  people: User[];
  wishlists: Wishlist[];
  catalog?: Place[];
  travel?: TravelMatrix;
  access?: Record<string, PlanningAccess>;
}
export interface PlanLeg {
  from: string; to: string; startMinute: number; endMinute: number; minutes: number; costCents: number;
}
export interface Proposal {
  constraints: PlannerConstraints;
  stops: PlanStop[];
  legs: PlanLeg[];
  totalCostCents: number;
  totalPartyCostCents: number;
  totalMinutes: number;
  finishMinute: number;
  checks: string[];
  warnings: string[];
  reasons: Record<string, string>;
  score: number;
}
export type PlannerResult =
  | { status: 'feasible'; proposal: Proposal; evaluatedPairs: number }
  | { status: 'infeasible' | 'unknown'; reasons: string[]; suggestions: string[]; evaluatedPairs: number };

export function localDate(clock: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: PLANNER_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(clock));
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
export function parseMinute(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return +match[1] * 60 + +match[2];
}
/** Decimal input is parsed as digits, never using floating-point currency arithmetic. */
export function parseBudgetCents(text: string): number | null {
  const match = /^\$?(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : null;
}
/** Resolve local wall-clock time with the actual LA offset (including daylight saving). */
export function localMinuteToISO(date: string, minute: number): string {
  if (!validCalendarDate(date) || !Number.isInteger(minute) || minute < 0 || minute >= 1440) throw new Error('Choose a valid local date and time.');
  const target = Date.parse(`${date}T${minuteLabel(minute)}:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: PLANNER_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let iteration = 0; iteration < 4; iteration++) {
    const parts = formatter.formatToParts(new Date(instant));
    const get = (key: string) => parts.find(part => part.type === key)?.value;
    const rendered = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
    if (rendered === target) return new Date(instant).toISOString();
    instant += target - rendered;
  }
  throw new Error('That local time does not exist because of a clock change. Choose another time.');
}
export function plannerEnvironment(state: AppState): PlannerEnvironment {
  return { sourceStatus: state.preferences.sourceStatus, wishlists: state.wishlists, people: users.map(user => user.id === 'you' ? { ...user, tastes: state.preferences.tastes } : user) };
}
export function defaultConstraints(clock: string): PlannerConstraints {
  return { participantIds: ['you', 'maya'], date: localDate(clock), startMinute: 840, endMinute: 1080, budgetCents: 2500, transport: 'walk', interests: ['cultural', 'park'], rain: false, excludedPlaceIds: [], preferredPlaceIds: ['la-the-broad', 'la-grand-park'], returnToOrigin: false, stepFree: false, assumeTimedEntry: true, lockedPlaceIds: [] };
}
export function restoredConstraints(constraints: PlanConstraints): PlannerConstraints {
  return { returnToOrigin: false, stepFree: false, assumeTimedEntry: false, lockedPlaceIds: [], ...constraints };
}
export function resolvePlannerContext(state: AppState, context: { placeIds?: string; participantIds?: string; wishlistId?: string }): { constraints: PlannerConstraints; error?: string; wishlistTitle?: string } {
  const constraints = defaultConstraints(state.clock);
  const split = (text: string) => [...new Set(text.split(',').map(value => value.trim()).filter(Boolean))];
  let list: Wishlist | undefined;
  if (context.wishlistId) {
    list = state.wishlists.find(item => item.id === context.wishlistId);
    if (!list) return { constraints, error: 'This wishlist is unavailable.' };
    constraints.participantIds = [...list.memberIds];
    constraints.preferredPlaceIds = list.entries.filter(entry => entry.saverIds.length > 0).map(entry => entry.placeId);
  }
  if (context.participantIds !== undefined) constraints.participantIds = split(context.participantIds);
  if (context.placeIds !== undefined) constraints.preferredPlaceIds = split(context.placeIds);
  if (!constraints.participantIds.includes('you') || constraints.participantIds.some(id => !users.some(user => user.id === id))) return { constraints, error: 'The people in this planner link are unavailable. Include You and known demo friends.' };
  if (constraints.preferredPlaceIds.some(id => !places.some(place => place.id === id))) return { constraints, error: 'A destination in this planner link is unavailable.' };
  return { constraints, wishlistTitle: list?.title };
}

export function parsePlannerPrompt(prompt: string, current: PlannerConstraints, clock: string): { constraints: PlannerConstraints; unknown: string[] } {
  let remaining = prompt.toLowerCase().replace(/[’']/g, '');
  const constraints = { ...current };
  const budget = remaining.match(/\$\d+(?:\.\d+)?\s*(?:\/\s*person|per person)?/);
  if (budget) {
    const cents = parseBudgetCents(budget[0].match(/\$[\d.]+/)?.[0] ?? '');
    if (cents !== null) { constraints.budgetCents = cents; remaining = remaining.replace(budget[0], ''); }
  }
  remaining = remaining.replace(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/, (whole, from: string, to: string) => {
    const start = parseMinute(from); const end = parseMinute(to);
    if (start === null || end === null) return whole;
    constraints.startMinute = start; constraints.endMinute = end; return '';
  });
  remaining = remaining.replace(/\d{4}-\d{2}-\d{2}/, date => { constraints.date = date; return ''; });
  if (/\bthis afternoon\b/.test(remaining)) { constraints.date = localDate(clock); constraints.startMinute = 840; constraints.endMinute = 1080; remaining = remaining.replace(/\bthis afternoon\b/, ''); }
  if (/\b(just me|alone)\b/.test(remaining)) { constraints.participantIds = ['you']; remaining = remaining.replace(/\b(just me|alone)\b/g, ''); }
  const named = users.filter(user => user.id !== 'you' && new RegExp(`\\b${user.name.toLowerCase()}\\b`).test(remaining));
  if (named.length) { constraints.participantIds = ['you', ...named.map(user => user.id)]; named.forEach(user => { remaining = remaining.replace(new RegExp(`\\b${user.name.toLowerCase()}\\b`, 'g'), ''); }); }
  if (/\btransit\b/.test(remaining)) constraints.transport = 'transit';
  if (/\bwalk(?:ing)?\b/.test(remaining)) constraints.transport = 'walk';
  if (/\brain(?:y)?\b/.test(remaining)) constraints.rain = true;
  if (/\bdry\b/.test(remaining)) constraints.rain = false;
  const categories: Category[] = [];
  if (/\b(culture|cultural)\b/.test(remaining)) categories.push('cultural');
  if (/\bparks?\b/.test(remaining)) categories.push('park');
  if (/\blandmarks?\b/.test(remaining)) categories.push('landmark');
  if (categories.length) constraints.interests = categories;
  remaining = remaining.replace(/\b(find|two|2|experiences?|well|we|will|both|like|please|for|us|with|you|and|by|using|in|the|transit|walking|walk|rainy|rain|dry|culture|cultural|parks?|landmarks?)\b/g, ' ').replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  return { constraints, unknown: remaining ? [remaining] : [] };
}

function constraintErrors(c: PlannerConstraints, environment: PlannerEnvironment): string[] {
  const errors: string[] = [];
  if (!validCalendarDate(c.date)) errors.push('Choose a valid local calendar date (YYYY-MM-DD).');
  if (![c.startMinute, c.endMinute].every(value => Number.isInteger(value) && value >= 0 && value < 1440) || c.endMinute <= c.startMinute) errors.push('Choose an end time after the start on the same local day.');
  if (!Number.isSafeInteger(c.budgetCents) || c.budgetCents < 0) errors.push('Budget must be a nonnegative whole number of cents per person.');
  if (!c.participantIds.length || !c.participantIds.includes('you') || new Set(c.participantIds).size !== c.participantIds.length || c.participantIds.some(id => !environment.people.some(user => user.id === id))) errors.push('Choose You and known, distinct demo participants.');
  if (!['walk', 'transit'].includes(c.transport)) errors.push('Choose walking or transit; other transport modes have no sample matrix.');
  if (!c.interests.length || c.interests.some(category => !['park', 'cultural', 'landmark'].includes(category))) errors.push('Choose at least one supported interest.');
  if (c.lockedPlaceIds.length > 2 || c.lockedPlaceIds.some(id => c.excludedPlaceIds.includes(id))) errors.push('A locked stop cannot also be excluded. Unlock it or change the exclusion.');
  const catalog = environment.catalog ?? places;
  if ([...c.preferredPlaceIds, ...c.excludedPlaceIds, ...c.lockedPlaceIds].some(id => !catalog.some(place => place.id === id))) errors.push('A selected place is no longer in the sample catalog.');
  return errors;
}
function candidateScore(place: Place, c: PlannerConstraints, environment: PlannerEnvironment): { score: number; reason: string } {
  const participants = c.participantIds.map(id => environment.people.find(user => user.id === id)!);
  const matched = participants.filter(user => user.tastes.includes(place.category));
  const shared = environment.wishlists.some(list => list.entries.some(entry => entry.placeId === place.id && c.participantIds.every(id => entry.saverIds.includes(id))));
  const score = Math.min(...participants.map(user => user.tastes.includes(place.category) ? 100 : 20)) + (c.interests.includes(place.category) ? 20 : 0) + (c.preferredPlaceIds.includes(place.id) ? 30 : 0) + (shared ? 4 : 0);
  const names = matched.map(user => user.name).join(' + ');
  const reason = `${matched.length ? `${names}: matches ${place.category === 'cultural' ? 'culture' : place.category === 'park' ? 'parks' : 'landmarks'} tastes.` : 'A discovery outside the selected people’s usual categories.'}${shared ? ' Saved by everyone in this party in a shared list.' : ''}${c.preferredPlaceIds.includes(place.id) ? ' A preferred stop.' : ''}`;
  return { score, reason };
}
const centsLabel = (value: number) => `$${(value / 100).toFixed(2)}`;
const failureLabels: Record<string, string> = {
  access: 'Access or timed-entry availability is unknown, closed, or not assumed for these stops.',
  accessibility: 'Step-free access is not known for the available alternatives.',
  weather: 'Rain excludes outdoor visits; not enough indoor stops fit all the other constraints.',
  travel: 'The selected mode has no valid sample travel coverage for these combinations.',
  hours: 'Opening windows, arrival buffers, and full visit durations do not fit.',
  window: 'Travel, 10-minute arrival buffers, visits, and any return leg exceed the time window.',
  budget: 'Admission plus sample travel costs exceed the per-person budget.',
  lock: 'No alternative can keep the other stop locked while respecting these constraints.',
};
export function planAfternoon(constraints: PlannerConstraints, environment: PlannerEnvironment): PlannerResult {
  // Clone arrays so an in-flight UI edit cannot mutate a completed proposal.
  const c: PlannerConstraints = { ...constraints, participantIds: [...constraints.participantIds], interests: [...constraints.interests], preferredPlaceIds: [...constraints.preferredPlaceIds], excludedPlaceIds: [...constraints.excludedPlaceIds], lockedPlaceIds: [...constraints.lockedPlaceIds] };
  const invalid = constraintErrors(c, environment);
  if (invalid.length) return { status: 'infeasible', reasons: invalid, suggestions: ['Edit the highlighted constraints and try again.'], evaluatedPairs: 0 };
  const weather = planningWeather(c.date, c.rain, environment.sourceStatus);
  if (environment.sourceStatus !== 'sample' || weather.status === 'unknown') return {
    status: 'unknown', reasons: [weather.label, environment.sourceStatus === 'stale' ? 'Hours and access are stale; feasibility is not verified.' : environment.sourceStatus === 'unavailable' ? 'Hours, costs, and access cannot be checked while the sample source is unavailable.' : 'No supported operational sample for this local date.'],
    suggestions: [`Choose a date from ${PLANNING_DATE_RANGE.from} through ${PLANNING_DATE_RANGE.through}.`, 'Restore Sample sources in Demo settings, then retry.'], evaluatedPairs: 0,
  };
  const catalog = (environment.catalog ?? places).filter(place => !c.excludedPlaceIds.includes(place.id));
  const access = environment.access ?? sampleAccess;
  const matrix = (environment.travel ?? sampleTravel)[c.transport];
  const failures = new Map<string, number>();
  const fail = (code: string) => { failures.set(code, (failures.get(code) ?? 0) + 1); };
  const eligible = catalog.filter(place => {
    const record = access[place.id];
    if (!record || record.status !== 'available' || record.closedDates?.includes(c.date) || (place.bookingRequired && (!c.assumeTimedEntry || !record.timedEntryMinutes?.length))) { fail('access'); return false; }
    if (c.stepFree && record.stepFree !== true) { fail('accessibility'); return false; }
    if (weather.rain && !place.tags.includes('indoors')) { fail('weather'); return false; }
    if (!Number.isSafeInteger(place.priceCents) || place.priceCents < 0 || !Number.isInteger(sampleVisitMinutes(place, access)) || sampleVisitMinutes(place, access) <= 0 || !Number.isFinite(place.openHour) || !Number.isFinite(place.closeHour)) { fail('access'); return false; }
    return true;
  });
  let best: Proposal | undefined;
  let evaluatedPairs = 0;
  for (const first of eligible) for (const second of eligible) {
    if (first.id === second.id) continue;
    evaluatedPairs++;
    const pair = [first, second];
    if (c.lockedPlaceIds.some(id => !pair.some(place => place.id === id))) { fail('lock'); continue; }
    let minute = c.startMinute; let totalCostCents = 0; let from = PLANNER_ORIGIN; let failure = '';
    const stops: PlanStop[] = []; const legs: PlanLeg[] = [];
    for (const place of pair) {
      const travel = matrix[travelKey(from, place.id)];
      if (!travel || !Number.isInteger(travel.minutes) || travel.minutes < 0 || !Number.isSafeInteger(travel.costCents) || travel.costCents < 0) { failure = 'travel'; break; }
      legs.push({ from, to: place.id, startMinute: minute, endMinute: minute + travel.minutes, ...travel });
      let arrivalMinute = Math.max(minute + travel.minutes + ARRIVAL_BUFFER_MINUTES, place.openHour * 60);
      if (place.bookingRequired) {
        const slot = access[place.id].timedEntryMinutes?.find(value => value >= arrivalMinute);
        if (slot === undefined) { failure = 'access'; break; }
        arrivalMinute = slot;
      }
      const departureMinute = arrivalMinute + sampleVisitMinutes(place, access);
      if (arrivalMinute < place.openHour * 60 || departureMinute > place.closeHour * 60) { failure = 'hours'; break; }
      if (departureMinute > c.endMinute) { failure = 'window'; break; }
      stops.push({ placeId: place.id, arrivalMinute, departureMinute, costCents: place.priceCents, travelMinutes: travel.minutes });
      totalCostCents += place.priceCents + travel.costCents;
      minute = departureMinute; from = place.id;
    }
    if (!failure && c.returnToOrigin) {
      const travel = matrix[travelKey(from, PLANNER_ORIGIN)];
      if (!travel || !Number.isInteger(travel.minutes) || travel.minutes < 0 || !Number.isSafeInteger(travel.costCents) || travel.costCents < 0) failure = 'travel';
      else { legs.push({ from, to: PLANNER_ORIGIN, startMinute: minute, endMinute: minute + travel.minutes, ...travel }); minute += travel.minutes; totalCostCents += travel.costCents; }
    }
    if (!failure && minute > c.endMinute) failure = 'window';
    if (!failure && totalCostCents > c.budgetCents) failure = 'budget';
    if (failure) { fail(failure); continue; }
    const scored = pair.map(place => candidateScore(place, c, environment));
    const warnings = ['Sample planning only — not live verification or a reservation.', 'Meals and optional purchases are excluded.', c.returnToOrigin ? 'Return to the sample origin is included.' : 'Finishes at the last stop. Return travel is not included.'];
    pair.forEach(place => { if (place.bookingRequired) warnings.push(`${place.name}: ${access[place.id].note}`); });
    if (weather.rain) warnings.push('Indoor visits only; sample walking/transit transfers are not sheltered routes.');
    const proposal: Proposal = {
      constraints: c, stops, legs, totalCostCents, totalPartyCostCents: totalCostCents * c.participantIds.length,
      totalMinutes: minute - c.startMinute, finishMinute: minute,
      score: scored.reduce((sum, item) => sum + item.score, 0) + (first.category !== second.category ? 6 : 0),
      reasons: Object.fromEntries(pair.map((place, index) => [place.id, scored[index].reason])), warnings,
      checks: [
        `Budget: ${centsLabel(totalCostCents)}/person ≤ ${centsLabel(c.budgetCents)}/person; ${centsLabel(totalCostCents * c.participantIds.length)} for ${c.participantIds.length}.`,
        `Local calendar: ${c.date}, ${minuteLabel(c.startMinute)}–${minuteLabel(c.endMinute)} America/Los_Angeles.`,
        'Both complete visits fit sample hours, with travel and a 10-minute arrival buffer at each stop.',
        weather.label,
        `Travel: labeled ${c.transport} sample matrix; ${legs.reduce((sum, leg) => sum + leg.minutes, 0)} minutes, ${centsLabel(legs.reduce((sum, leg) => sum + leg.costCents, 0))}/person.`,
        `Access: sample public access${pair.some(place => place.bookingRequired) ? ' and assumed timed-entry availability (not booked)' : ''}.`,
        c.stepFree ? 'Step-free sample access checked for both venues; transfer accessibility is not verified.' : 'No step-free requirement selected; accessibility is not verified.',
      ],
    };
    const key = pair.map(place => place.id).join('|');
    if (!best || proposal.score > best.score || (proposal.score === best.score && (proposal.totalMinutes < best.totalMinutes || (proposal.totalMinutes === best.totalMinutes && key < best.stops.map(stop => stop.placeId).join('|'))))) best = proposal;
  }
  if (best) return { status: 'feasible', proposal: best, evaluatedPairs };
  const reasons = [...failures].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => failureLabels[code]);
  if (c.endMinute - c.startMinute <= 30) reasons.unshift('Two visits don’t fit this 30-minute window. Travel and arrival buffers also need time.');
  if (catalog.length < 2 || eligible.length < 2) reasons.unshift('Fewer than two distinct eligible experiences remain.');
  return { status: 'infeasible', reasons: reasons.length ? reasons : ['No two distinct experiences fit these constraints.'], suggestions: ['Lengthen the window or explore one experience instead.', 'Increase the budget, change mode, or remove an exclusion.', 'For rain, keep indoor alternatives and their travel time available.'], evaluatedPairs };
}

export function revisionSummary(before: Proposal, after: Proposal): string[] {
  const oldIds = before.stops.map(stop => stop.placeId); const newIds = after.stops.map(stop => stop.placeId);
  const names = (ids: string[]) => ids.map(id => places.find(place => place.id === id)?.name ?? id).join(', ');
  const removed = oldIds.filter(id => !newIds.includes(id)); const added = newIds.filter(id => !oldIds.includes(id));
  const cost = after.totalCostCents - before.totalCostCents; const finish = after.finishMinute - before.finishMinute;
  return [
    removed.length ? `Removed: ${names(removed)}. Added: ${names(added)}.` : 'The same two stops still fit; no artificial replacement is needed.',
    `Cost change: ${cost < 0 ? '−' : '+'}${centsLabel(Math.abs(cost))}/person. Finish-time change: ${finish > 0 ? '+' : ''}${finish} min.`,
    ...(before.constraints.date !== after.constraints.date ? [`Local date changed to ${after.constraints.date}.`] : []),
    ...after.warnings.filter(warning => !before.warnings.includes(warning)),
  ];
}
export function acceptedPlan(proposal: Proposal, requestId: string, clock: string, version = 1): Plan {
  return { id: `plan-${requestId}`, requestId, title: `${proposal.constraints.participantIds.length > 1 ? 'An afternoon together' : 'An afternoon for you'}`, constraints: proposal.constraints, stops: proposal.stops, totalCostCents: proposal.totalCostCents, totalMinutes: proposal.totalMinutes, checks: [...proposal.checks, ...proposal.warnings], version, status: 'accepted', createdAt: clock };
}
export function missingPersonalSaves(state: AppState, plan: Plan): string[] {
  const personal = state.wishlists.find(list => list.isDefault || list.id === 'personal');
  return plan.stops.map(stop => stop.placeId).filter(id => !personal?.entries.some(entry => entry.placeId === id && entry.saverIds.includes('you')));
}
export function associatedEdition(state: AppState, planId: string, placeId: string) {
  const outing = state.outings.find(item => item.planId === planId);
  return outing ? state.editions.find(edition => edition.ownerId === 'you' && edition.outingId === outing.id && edition.placeId === placeId) : undefined;
}
