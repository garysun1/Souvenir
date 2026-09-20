import {
  acceptedPlan, associatedEdition, defaultConstraints, localDate, localMinuteToISO,
  missingPersonalSaves, parseBudgetCents, parseMinute, parsePlannerPrompt, planAfternoon,
  plannerEnvironment, resolvePlannerContext, revisionSummary, SUGGESTED_PROMPT,
  type PlannerConstraints, type PlannerEnvironment, type Proposal,
} from '@/domain/planner';
import type { Edition } from '@/domain/types';
import { places, users } from '@/fixtures/catalog';
import { PLANNER_ORIGIN, sampleAccess, sampleTravel, travelKey } from '@/fixtures/travel';
import { planningWeather } from '@/fixtures/weather';
import { reducer } from '@/state/reducer';
import { createSeed, DEMO_CLOCK } from '@/state/seed';

const defaults = () => defaultConstraints(DEMO_CLOCK);
const environment = (): PlannerEnvironment => plannerEnvironment(createSeed());
function feasible(c = defaults(), env = environment()): Proposal {
  const result = planAfternoon(c, env);
  if (result.status !== 'feasible') throw new Error(JSON.stringify(result));
  return result.proposal;
}
function restricted(ids: string[], patch: Partial<PlannerConstraints> = {}) {
  return { c: { ...defaults(), preferredPlaceIds: ids, ...patch }, env: { ...environment(), catalog: places.filter(place => ids.includes(place.id)) } };
}
const ids = (proposal: Proposal) => proposal.stops.map(stop => stop.placeId);

describe('integer money and local calendar boundaries', () => {
  test.each([['25', 2500], ['$0', 0], ['10.50', 1050], ['0.29', 29], ['1.1', 110], ['999999.99', 99999999]])('parses %s as exactly %i cents', (text, cents) => {
    expect(parseBudgetCents(text)).toBe(cents);
  });
  test.each(['-1', '1.001', 'Infinity', '1e2', 'NaN', '10 dollars', '', '.5', '1,000'])('rejects ambiguous money %s', text => expect(parseBudgetCents(text)).toBeNull());
  test('local date does not accidentally become the UTC day', () => {
    expect(localDate('2026-09-20T02:00:00Z')).toBe('2026-09-19');
    expect(defaultConstraints('2026-09-20T02:00:00Z').date).toBe('2026-09-19');
  });
  test('LA conversion uses summer and winter offsets, not a fixed UTC assumption', () => {
    expect(localMinuteToISO('2026-09-19', 865)).toBe('2026-09-19T21:25:00.000Z');
    expect(localMinuteToISO('2026-12-19', 865)).toBe('2026-12-19T22:25:00.000Z');
    expect(localMinuteToISO('2026-09-19', 0)).toBe('2026-09-19T07:00:00.000Z');
    expect(() => localMinuteToISO('2026-02-30', 840)).toThrow();
    expect(() => localMinuteToISO('2026-03-08', 150)).toThrow();
    expect(() => localMinuteToISO('2026-09-19', 1440)).toThrow();
  });
  test('times are strict and stay inside the local day', () => {
    expect(parseMinute('16:30')).toBe(990);
    expect(parseMinute('24:00')).toBeNull();
    expect(parseMinute('14:60')).toBeNull();
    expect(planAfternoon({ ...defaults(), date: '2026-02-30' }, environment()).status).toBe('infeasible');
    expect(planAfternoon({ ...defaults(), startMinute: 1080, endMinute: 840 }, environment()).status).toBe('infeasible');
  });
});

describe('full deterministic two-stop feasibility', () => {
  test('default is the exact Broad + Grand Park sample with explicit timed-entry assumption', () => {
    const proposal = feasible();
    expect(ids(proposal)).toEqual(['la-the-broad', 'la-grand-park']);
    expect(proposal.stops.map(stop => [stop.arrivalMinute, stop.departureMinute])).toEqual([[865, 925], [947, 992]]);
    expect(proposal.legs.map(leg => leg.minutes)).toEqual([15, 12]);
    expect(proposal.totalMinutes).toBe(152);
    expect(proposal.totalCostCents).toBe(0);
    expect(proposal.totalPartyCostCents).toBe(0);
    expect(proposal.warnings.join(' ')).toMatch(/timed entry.*assumed available.*No ticket is held or booked/);
    expect(proposal.checks).toHaveLength(7);
    expect(proposal).toEqual(feasible());
  });
  test('finish boundary is inclusive; one minute shorter fails with complete visits intact', () => {
    const { c, env } = restricted(['la-the-broad', 'la-grand-park'], { endMinute: 992 });
    expect(feasible(c, env).finishMinute).toBe(992);
    expect(planAfternoon({ ...c, endMinute: 991 }, env).status).toBe('infeasible');
  });
  test('admission budget is inclusive and calculated in integer cents', () => {
    const { c, env } = restricted(['la-janm', 'la-angels-flight'], { budgetCents: 1800 });
    expect(feasible(c, env).totalCostCents).toBe(1800);
    expect(feasible(c, env).totalPartyCostCents).toBe(3600);
    expect(planAfternoon({ ...c, budgetCents: 1799 }, env).status).toBe('infeasible');
    expect(planAfternoon({ ...c, budgetCents: 1800.5 }, env).status).toBe('infeasible');
  });
  test('lowering budget on a free plan makes no artificial replacement', () => {
    const before = feasible(); const after = feasible({ ...defaults(), budgetCents: 1000 });
    expect(ids(after)).toEqual(ids(before));
    expect(after.stops).toEqual(before.stops);
    expect(revisionSummary(before, after)[0]).toMatch(/same two stops still fit/);
    expect(feasible({ ...defaults(), budgetCents: 0 }).totalCostCents).toBe(0);
  });
  test('30-minute window is rejected without truncating visits or skipping buffers', () => {
    const result = planAfternoon({ ...defaults(), startMinute: 990, endMinute: 1020 }, environment());
    expect(result.status).toBe('infeasible');
    if (result.status !== 'feasible') expect(result.reasons.join(' ')).toMatch(/Two visits don’t fit this 30-minute window/);
  });
  test('opening times and closing boundary are checked for the entire visit', () => {
    const { c, env } = restricted(['la-grand-park', 'la-moca'], { startMinute: 540, endMinute: 800 });
    const result = feasible(c, env);
    const moca = result.stops.find(stop => stop.placeId === 'la-moca')!;
    expect(moca.arrivalMinute).toBeGreaterThanOrEqual(600);
    const closed = { ...env, catalog: env.catalog.map(place => ({ ...place, closeHour: 9 })) };
    expect(planAfternoon(c, closed).status).toBe('infeasible');
  });
  test('all legs change in transit mode and every fare is counted', () => {
    const walking = feasible(); const transit = feasible({ ...defaults(), transport: 'transit', budgetCents: 350 });
    expect(transit.legs.map(leg => leg.minutes)).not.toEqual(walking.legs.map(leg => leg.minutes));
    expect(transit.totalCostCents).toBe(350);
    expect(transit.totalPartyCostCents).toBe(700);
    const { c, env } = restricted(['la-the-broad', 'la-grand-park'], { transport: 'transit', budgetCents: 349 });
    expect(planAfternoon(c, env).status).toBe('infeasible');
  });
  test('optional return consumes time and its own transit fare, and obeys the end boundary', () => {
    const { c, env } = restricted(['la-the-broad', 'la-grand-park'], { returnToOrigin: true, transport: 'transit', budgetCents: 525 });
    const result = feasible(c, env);
    expect(result.legs).toHaveLength(3);
    expect(result.legs[2].to).toBe(PLANNER_ORIGIN);
    expect(result.totalCostCents).toBe(525);
    expect(planAfternoon({ ...c, budgetCents: 524 }, env).status).toBe('infeasible');
    expect(planAfternoon({ ...c, endMinute: result.finishMinute - 1 }, env).status).toBe('infeasible');
  });
  test('missing travel matrix or corrupt price cannot be labeled feasible', () => {
    const { c, env } = restricted(['la-the-broad', 'la-grand-park']);
    expect(planAfternoon(c, { ...env, travel: { walk: {}, transit: {} } }).status).toBe('infeasible');
    expect(planAfternoon(c, { ...env, catalog: env.catalog.map(place => ({ ...place, priceCents: NaN })) }).status).toBe('infeasible');
  });
  test('unknown return routing blocks a return plan, even if outward legs work', () => {
    const { c, env } = restricted(['la-the-broad', 'la-grand-park'], { returnToOrigin: true });
    const walk = { ...sampleTravel.walk };
    delete walk[travelKey('la-the-broad', PLANNER_ORIGIN)]; delete walk[travelKey('la-grand-park', PLANNER_ORIGIN)];
    expect(planAfternoon(c, { ...env, travel: { ...sampleTravel, walk } }).status).toBe('infeasible');
  });
});

describe('pair selection, access, rain and honest source states', () => {
  test('rain chooses two indoor stops and recalculates the itinerary', () => {
    const dry = feasible(); const rain = feasible({ ...defaults(), rain: true });
    expect(ids(rain)).not.toContain('la-grand-park');
    expect(rain.stops.every(stop => places.find(place => place.id === stop.placeId)?.tags.includes('indoors'))).toBe(true);
    expect(rain.stops).not.toEqual(dry.stops);
    expect(revisionSummary(dry, rain).join(' ')).toMatch(/Removed: Grand Park/);
    expect(rain.warnings.join(' ')).toMatch(/transfers are not sheltered/);
  });
  test('rain can be honestly infeasible if only outdoor candidates remain', () => {
    const { c, env } = restricted(['la-grand-park', 'la-disney-hall'], { rain: true });
    expect(planAfternoon(c, env).status).toBe('infeasible');
  });
  test('excluding the Broad substitutes rather than silently ignoring exclusion', () => {
    const result = feasible({ ...defaults(), excludedPlaceIds: ['la-the-broad'] });
    expect(ids(result)).not.toContain('la-the-broad');
    expect(result.stops).toHaveLength(2);
  });
  test('replacing one stop locks the other and never duplicates a destination', () => {
    const result = feasible({ ...defaults(), excludedPlaceIds: ['la-grand-park'], lockedPlaceIds: ['la-the-broad'] });
    expect(ids(result)).toContain('la-the-broad');
    expect(ids(result)).not.toContain('la-grand-park');
    expect(new Set(ids(result)).size).toBe(2);
    expect(planAfternoon({ ...defaults(), excludedPlaceIds: ['la-the-broad'], lockedPlaceIds: ['la-the-broad'] }, environment()).status).toBe('infeasible');
  });
  test('unknown/closed access, timed entry opt-out, and a calendar closure are hard gates', () => {
    const { c, env } = restricted(['la-the-broad', 'la-grand-park']);
    expect(planAfternoon({ ...c, assumeTimedEntry: false }, env).status).toBe('infeasible');
    expect(planAfternoon({ ...c, date: '2026-09-21' }, env).status).toBe('infeasible');
    expect(planAfternoon(c, { ...env, access: { ...sampleAccess, 'la-the-broad': { ...sampleAccess['la-the-broad'], status: 'unknown' } } }).status).toBe('infeasible');
    expect(planAfternoon(c, { ...env, access: { ...sampleAccess, 'la-grand-park': { ...sampleAccess['la-grand-park'], status: 'closed' } } }).status).toBe('infeasible');
  });
  test('unknown sample step-free venue access blocks that venue when required', () => {
    const { c, env } = restricted(['la-bradbury', 'la-grand-park'], { stepFree: true });
    expect(planAfternoon(c, env).status).toBe('infeasible');
    expect(feasible({ ...c, stepFree: false }, env).stops).toHaveLength(2);
  });
  test.each(['unavailable', 'stale'] as const)('%s sources cannot claim checked feasibility', sourceStatus => {
    const result = planAfternoon(defaults(), { ...environment(), sourceStatus });
    expect(result.status).toBe('unknown');
    if (result.status !== 'feasible') expect(result.reasons.join(' ')).toMatch(/Weather not checked/);
  });
  test('outside sample dates is unknown rather than extrapolated weather', () => {
    expect(planningWeather('2026-09-27', false, 'sample').status).toBe('unknown');
    expect(planAfternoon({ ...defaults(), date: '2026-09-27' }, environment()).status).toBe('unknown');
  });
  test('removing a participant recalculates reasons and party total', () => {
    const result = feasible({ ...defaults(), participantIds: ['you'], transport: 'transit' });
    expect(Object.values(result.reasons).join(' ')).not.toMatch(/Maya/);
    expect(result.totalPartyCostCents).toBe(result.totalCostCents);
    expect(Object.values(result.reasons).join(' ')).toMatch(/You/);
  });
  test('weakest participant taste is optimized, not just the first person’s tastes', () => {
    const c = { ...defaults(), participantIds: ['you', 'jordan'], preferredPlaceIds: [], interests: ['cultural', 'park'] as PlannerConstraints['interests'] };
    const result = feasible(c, environment());
    expect(ids(result)).toContain('la-grand-park');
    expect(result.reasons['la-grand-park']).toMatch(/You \+ Jordan/);
  });
  test('stable tie-breaking does not depend on catalog order', () => {
    const c = { ...defaults(), preferredPlaceIds: [] };
    expect(feasible(c, { ...environment(), catalog: [...places].reverse() })).toEqual(feasible(c, environment()));
  });
  test('fixtures contain only safe integer costs and positive matrix minutes', () => {
    for (const mode of Object.values(sampleTravel)) for (const value of Object.values(mode)) {
      expect(Number.isSafeInteger(value.costCents)).toBe(true);
      expect(Number.isInteger(value.minutes)).toBe(true);
      expect(value.minutes).toBeGreaterThan(0);
      expect(value.costCents).toBeGreaterThanOrEqual(0);
    }
    expect(users.every(user => user.tastes.length > 0)).toBe(true);
  });
});

describe('prompt and cross-flow context', () => {
  test('suggested prompt parses into editable defaults', () => {
    const result = parsePlannerPrompt(SUGGESTED_PROMPT, defaults(), DEMO_CLOCK);
    expect(result.unknown).toEqual([]);
    expect(result.constraints.budgetCents).toBe(2500);
    expect(result.constraints.startMinute).toBe(840);
  });
  test('supported changes parse and unknown requirements remain explicit', () => {
    const result = parsePlannerPrompt('Find two experiences with Sam, $10.29/person, transit, rain, 16:30–17:00', defaults(), DEMO_CLOCK);
    expect(result.unknown).toEqual([]);
    expect(result.constraints).toMatchObject({ budgetCents: 1029, participantIds: ['you', 'sam'], rain: true, transport: 'transit', startMinute: 990, endMinute: 1020 });
    expect(parsePlannerPrompt('Find two experiences, dog friendly, drive', defaults(), DEMO_CLOCK).unknown).toEqual(['dog friendly drive']);
    expect(parsePlannerPrompt('$1.001/person', defaults(), DEMO_CLOCK).unknown.length).toBeGreaterThan(0);
  });
  test('wishlist context carries members and preferred places; explicit IDs override', () => {
    const state = createSeed();
    const list = resolvePlannerContext(state, { wishlistId: 'saturday-maya' });
    expect(list.constraints.participantIds).toEqual(['you', 'maya']);
    expect(list.constraints.preferredPlaceIds).toContain('la-moca');
    expect(list.wishlistTitle).toBe('Saturday with Maya');
    const explicit = resolvePlannerContext(state, { wishlistId: 'saturday-maya', participantIds: 'you,sam', placeIds: 'la-central-library,la-central-library' });
    expect(explicit.constraints.participantIds).toEqual(['you', 'sam']);
    expect(explicit.constraints.preferredPlaceIds).toEqual(['la-central-library']);
  });
  test('invalid entry-point IDs get unavailable states', () => {
    expect(resolvePlannerContext(createSeed(), { wishlistId: 'missing' }).error).toBeDefined();
    expect(resolvePlannerContext(createSeed(), { placeIds: 'missing' }).error).toBeDefined();
    expect(resolvePlannerContext(createSeed(), { participantIds: 'stranger' }).error).toBeDefined();
  });
});

describe('shared persistence contract: acceptance, saves and visit completion', () => {
  test('acceptance is idempotent, atomic, and does not save everyone’s stops', () => {
    const plan = acceptedPlan(feasible(), 'stable-request', DEMO_CLOCK);
    const initial = createSeed();
    const accepted = reducer(initial, { type: 'ACCEPT_PLAN', plan });
    const retried = reducer(accepted, { type: 'ACCEPT_PLAN', plan: { ...plan, id: 'a-retry-id-is-not-a-second-plan' } });
    expect(retried).toBe(accepted);
    expect(retried.plans).toHaveLength(1);
    expect(retried.outings).toHaveLength(1);
    expect(retried.outings[0].id).toBe(`outing-${plan.id}`);
    expect(retried.wishlists).toEqual(initial.wishlists);
    expect(missingPersonalSaves(retried, plan)).toEqual(['la-the-broad', 'la-grand-park']);
  });
  test('accepted revision preserves the original plan and its outing', () => {
    const original = acceptedPlan(feasible(), 'version-1', DEMO_CLOCK);
    const revision = acceptedPlan(feasible({ ...defaults(), rain: true }), 'version-2', DEMO_CLOCK, 2);
    let state = reducer(createSeed(), { type: 'ACCEPT_PLAN', plan: original });
    state = reducer(state, { type: 'ACCEPT_PLAN', plan: revision });
    expect(state.plans).toEqual([original, revision]);
    expect(state.outings).toHaveLength(2);
  });
  test('arrival updates shared time; only two own outing-associated captures complete the plan', () => {
    const plan = acceptedPlan(feasible(), 'visit-request', DEMO_CLOCK);
    let state = reducer(createSeed(), { type: 'ACCEPT_PLAN', plan });
    const outingId = state.outings[0].id;
    const makeEdition = (index: number, ownerId = 'you', linked = true): Omit<Edition, 'sequence'> => ({
      id: `visit-${index}-${ownerId}-${linked}`, requestId: `visit-${index}-${ownerId}-${linked}`, placeId: plan.stops[index].placeId,
      ownerId, visitedAt: localMinuteToISO(plan.constraints.date, plan.stops[index].arrivalMinute), timezone: 'America/Los_Angeles',
      companions: ['maya'], moment: 'An afternoon together.', origin: 'capture', outingId: linked ? outingId : undefined,
    });
    state = reducer(state, { type: 'CLOCK', clock: localMinuteToISO(plan.constraints.date, plan.stops[0].arrivalMinute) });
    expect(state.clock).toBe('2026-09-19T21:25:00.000Z');
    state = reducer(state, { type: 'ADD_EDITION', edition: makeEdition(0, 'you', false) });
    state = reducer(state, { type: 'ADD_EDITION', edition: makeEdition(0, 'maya') });
    state = reducer(state, { type: 'ADD_EDITION', edition: makeEdition(1, 'maya') });
    expect(state.plans[0].status).toBe('accepted');
    expect(associatedEdition(state, plan.id, plan.stops[0].placeId)).toBeUndefined();
    state = reducer(state, { type: 'ADD_EDITION', edition: makeEdition(0) });
    expect(state.plans[0].status).toBe('accepted');
    expect(associatedEdition(state, plan.id, plan.stops[0].placeId)?.ownerId).toBe('you');
    state = reducer(state, { type: 'CLOCK', clock: localMinuteToISO(plan.constraints.date, plan.stops[1].arrivalMinute) });
    expect(state.clock).toBe('2026-09-19T22:47:00.000Z');
    state = reducer(state, { type: 'ADD_EDITION', edition: makeEdition(1) });
    expect(state.plans[0].status).toBe('completed');
  });
  test('optional personal save is retryable without toggling already-saved entries off', () => {
    const plan = acceptedPlan(feasible(), 'save-test', DEMO_CLOCK);
    let state = createSeed();
    for (const id of missingPersonalSaves(state, plan)) state = reducer(state, { type: 'SAVE_PLACE', placeId: id, wishlistId: 'personal' });
    expect(missingPersonalSaves(state, plan)).toEqual([]);
    expect(state.wishlists.find(list => list.id === 'saturday-maya')).toEqual(createSeed().wishlists[1]);
  });
});
