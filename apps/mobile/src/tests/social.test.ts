import type { Edition, Plan } from '@/domain/types';
import { activityDate, clockTime, fictionalEditions, friendSummary, invitationToken, matchingEditions, mayaConfirmation, outingDetails, publicEditions, resolveInvitation, searchSocialPlaces, socialActivity, wishlistOverlap, wishlistPlannerParams } from '@/domain/social';
import { createSeed } from '@/state/seed';
import { reducer } from '@/state/reducer';
import { collectedPlaceIds, ownEditions, setProgress } from '@/state/selectors';
import { placeById, users } from '@/fixtures/catalog';

const plan: Plan = {
  id: 'social-plan', requestId: 'social-plan-request', title: 'Saturday with Maya',
  constraints: { participantIds: ['you', 'maya'], date: '2026-09-19', startMinute: 840, endMinute: 1080, budgetCents: 2500, transport: 'walk', interests: ['cultural', 'park'], rain: false, excludedPlaceIds: [], preferredPlaceIds: ['la-the-broad', 'la-grand-park'] },
  stops: [{ placeId: 'la-the-broad', arrivalMinute: 865, departureMinute: 925, costCents: 0, travelMinutes: 15 }, { placeId: 'la-grand-park', arrivalMinute: 947, departureMinute: 992, costCents: 0, travelMinutes: 12 }],
  totalCostCents: 0, totalMinutes: 152, checks: [], version: 1, status: 'accepted', createdAt: '2026-09-19T21:00:00.000Z',
};
const outingId = `outing-${plan.id}`;
const yours: Omit<Edition, 'sequence'> = { id: 'social-your-visit', requestId: 'social-your-capture', ownerId: 'you', placeId: 'la-the-broad', visitedAt: '2026-09-19T21:30:00.000Z', timezone: 'America/Los_Angeles', companions: ['maya'], moment: 'My private view of the afternoon.', photoUri: 'media:your-personal-photo.jpg', origin: 'capture', outingId };
const plannedState = () => reducer(createSeed(), { type: 'ACCEPT_PLAN', plan });
const visitedState = () => reducer(plannedState(), { type: 'ADD_EDITION', edition: yours });

describe('shared wishlist attribution and handoff', () => {
  test('Broad changes actual overlap 2 → 3; undo keeps Maya’s save intact', () => {
    const initial = createSeed();
    expect(wishlistOverlap(initial.wishlists[1])).toEqual(['la-grand-park', 'la-moca']);
    const personal = reducer(initial, { type: 'SAVE_PLACE', wishlistId: 'personal', placeId: 'la-the-broad' });
    expect(wishlistOverlap(personal.wishlists[1])).toHaveLength(2);
    const saved = reducer(personal, { type: 'SAVE_PLACE', wishlistId: 'saturday-maya', placeId: 'la-the-broad' });
    expect(wishlistOverlap(saved.wishlists[1])).toHaveLength(3);
    const removed = reducer(saved, { type: 'SAVE_PLACE', wishlistId: 'saturday-maya', placeId: 'la-the-broad' });
    expect(wishlistOverlap(removed.wishlists[1])).toHaveLength(2);
    expect(removed.wishlists[1].entries.find(entry => entry.placeId === 'la-the-broad')?.saverIds).toEqual(['maya']);
  });

  test('zero overlap and single-member lists do not produce misleading common-save counts', () => {
    const state = createSeed('empty');
    expect(wishlistOverlap(state.wishlists[1])).toEqual([]);
    expect(wishlistOverlap({ ...state.wishlists[0], entries: [{ placeId: 'la-the-broad', saverIds: ['you'], completedBy: [] }] })).toEqual([]);
    expect(wishlistOverlap({ ...state.wishlists[0], memberIds: [] })).toEqual([]);
  });

  test('planner receives actual members and the union of saved places, not only overlap', () => {
    const list = createSeed().wishlists[1];
    expect(wishlistPlannerParams(list)).toEqual({ wishlistId: 'saturday-maya', participantIds: 'you,maya', placeIds: 'la-grand-park,la-moca,la-the-broad,la-disney-hall' });
    expect(wishlistPlannerParams({ ...list, entries: [], memberIds: ['you', 'maya', 'maya', 'missing'] })).toEqual({ wishlistId: list.id, participantIds: 'you,maya', placeIds: '' });
  });

  test('explicit completion is independent of saving and capturing', () => {
    const state = visitedState();
    expect(state.wishlists[1].entries.find(entry => entry.placeId === 'la-the-broad')?.completedBy).toEqual([]);
    const completed = reducer(state, { type: 'COMPLETE_WISHLIST', wishlistId: 'saturday-maya', placeId: 'la-the-broad' });
    expect(completed.wishlists[1].entries.find(entry => entry.placeId === 'la-the-broad')?.completedBy).toEqual(['you']);
    expect(completed.editions).toEqual(state.editions);
  });

  test('catalog search is case-insensitive and supports multiple words, with empty results', () => {
    expect(searchSocialPlaces('  BROAD downtown ').map(place => place.id)).toEqual(['la-the-broad']);
    expect(searchSocialPlaces('no such experience')).toEqual([]);
    expect(searchSocialPlaces('')).toHaveLength(30);
  });
});

describe('fictional activity derived from records', () => {
  test('fixtures reference actual places and people and do not change private counts', () => {
    const state = createSeed();
    for (const edition of fictionalEditions) {
      expect(placeById(edition.placeId)).toBeDefined();
      expect(users.some(user => user.id === edition.ownerId && user.id !== 'you')).toBe(true);
    }
    expect(friendSummary(state, 'maya').placeIds).toHaveLength(2);
    expect(friendSummary(state, 'maya').savedIds).toEqual(['la-grand-park', 'la-moca', 'la-the-broad']);
    socialActivity(state);
    expect([collectedPlaceIds(state).length, ownEditions(state).length, setProgress(state)]).toEqual([6, 7, 1]);
  });

  test('imports never appear in the feed; an explicit capture does', () => {
    const imported = reducer(createSeed(), { type: 'ADD_EDITION', edition: { ...yours, origin: 'import', importSourceId: 'private-import' } });
    expect(socialActivity(imported).some(item => item.id === yours.id)).toBe(false);
    expect(publicEditions(imported).some(edition => edition.id === yours.id)).toBe(false);
    expect(socialActivity(visitedState()).some(item => item.id === yours.id)).toBe(true);
  });

  test('accepted shared plans are in the feed once and newest first; solo plans are not', () => {
    const state = reducer(plannedState(), { type: 'ACCEPT_PLAN', plan });
    const entries = socialActivity(state).filter(item => item.kind === 'plan');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ outingId, plan });
    expect(socialActivity(state)[0].kind).toBe('plan');
    const solo = reducer(createSeed(), { type: 'ACCEPT_PLAN', plan: { ...plan, constraints: { ...plan.constraints, participantIds: ['you'] } } });
    expect(socialActivity(solo).some(item => item.kind === 'plan')).toBe(false);
  });

  test('empty user profiles retain fictional friends without inventing the user’s activity', () => {
    const activity = socialActivity(createSeed('empty'));
    expect(activity).toHaveLength(fictionalEditions.length);
    expect(activity.every(item => item.kind === 'edition' && item.edition.ownerId !== 'you')).toBe(true);
  });
});

describe('outings and explicit simulation', () => {
  test('invalid, orphaned, solo, and unvisited stops cannot simulate another person’s visit', () => {
    expect(outingDetails(createSeed(), 'missing')).toBeUndefined();
    expect(outingDetails({ ...plannedState(), plans: [] }, outingId)).toBeUndefined();
    expect(mayaConfirmation(plannedState(), outingId, 'la-the-broad')).toBeUndefined();
    expect(mayaConfirmation(visitedState(), outingId, 'la-getty')).toBeUndefined();
    expect(mayaConfirmation(visitedState(), 'missing', 'la-the-broad')).toBeUndefined();
    expect(mayaConfirmation({ ...visitedState(), outings: [{ ...plannedState().outings[0], participantIds: ['you'] }] }, outingId, 'la-the-broad')).toBeUndefined();
  });

  test('companion selection alone does not make a matching edition', () => {
    const members = matchingEditions(visitedState(), outingId, 'la-the-broad');
    expect(members.find(member => member.ownerId === 'you')?.edition).toMatchObject(yours);
    expect(members.find(member => member.ownerId === 'maya')?.edition).toBeUndefined();
    expect(matchingEditions(visitedState(), outingId, 'la-getty')).toEqual([]);
  });

  test('Maya confirms once with an independent photo/note and never increments your counters', () => {
    const before = visitedState();
    const input = mayaConfirmation(before, outingId, 'la-the-broad')!;
    expect(input.ownerId).toBe('maya');
    expect(input.photoUri).not.toBe(yours.photoUri);
    expect(input.moment).not.toBe(yours.moment);
    expect(input.outingId).toBe(yours.outingId);
    const saved = reducer(before, { type: 'ADD_EDITION', edition: input });
    const retried = reducer(saved, { type: 'ADD_EDITION', edition: input });
    expect(retried).toBe(saved);
    expect(mayaConfirmation(saved, outingId, 'la-the-broad')).toBeUndefined();
    expect(matchingEditions(saved, outingId, 'la-the-broad').filter(member => member.edition)).toHaveLength(2);
    expect([collectedPlaceIds(saved).length, ownEditions(saved).length, setProgress(saved)]).toEqual([7, 8, 2]);
    expect(saved.plans[0].status).toBe('accepted');
  });

  test('both stops complete the user’s plan; Maya’s two confirmations never change 8/9/3', () => {
    let state = reducer(visitedState(), { type: 'ADD_EDITION', edition: { ...yours, id: 'social-park-visit', requestId: 'social-park-capture', placeId: 'la-grand-park' } });
    expect(state.plans[0].status).toBe('completed');
    for (const placeId of ['la-the-broad', 'la-grand-park']) {
      const edition = mayaConfirmation(state, outingId, placeId)!;
      state = reducer(state, { type: 'ADD_EDITION', edition });
      expect([collectedPlaceIds(state).length, ownEditions(state).length, setProgress(state)]).toEqual([8, 9, 3]);
      expect(state.plans[0].status).toBe('completed');
    }
    expect(state.editions.filter(edition => edition.ownerId === 'maya')).toHaveLength(2);
  });

  test('editing your moment does not rewrite Maya’s independently stored edition', () => {
    const before = visitedState();
    const maya = mayaConfirmation(before, outingId, 'la-the-broad')!;
    const shared = reducer(before, { type: 'ADD_EDITION', edition: maya });
    const edited = reducer(shared, { type: 'EDIT_EDITION', id: yours.id, patch: { moment: 'A new description of my memory.', visitedAt: yours.visitedAt, companions: [] } });
    expect(edited.editions.find(edition => edition.id === maya.id)).toMatchObject(maya);
    expect(matchingEditions(edited, outingId, 'la-the-broad').find(member => member.ownerId === 'you')?.edition?.moment).toBe('A new description of my memory.');
    expect(mayaConfirmation(JSON.parse(JSON.stringify(edited)), outingId, 'la-the-broad')).toBeUndefined();
  });

  test('a different outing for the same destination never counts as a match', () => {
    const otherVisit = reducer(plannedState(), { type: 'ADD_EDITION', edition: { ...yours, outingId: 'another-outing' } });
    expect(matchingEditions(otherVisit, outingId, 'la-the-broad').every(member => !member.edition)).toBe(true);
    expect(mayaConfirmation(otherVisit, outingId, 'la-the-broad')).toBeUndefined();
  });

  test('demo tokens resolve only existing local lists, without sending or joining', () => {
    const state = createSeed();
    expect(resolveInvitation(state, invitationToken('saturday-maya'))).toBe(state.wishlists[1]);
    expect(resolveInvitation(state, 'souvenir-demo:wishlist:missing')).toBeUndefined();
    expect(state.wishlists[1].memberIds).toEqual(['you', 'maya']);
  });

  test('timeline formatting is independent of device timezone', () => {
    expect(clockTime(865)).toBe('14:25');
    expect(activityDate('2026-09-19T21:00:00.000Z')).toContain('2:00 PM');
  });
});
