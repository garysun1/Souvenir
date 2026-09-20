import type { EditionCreate, EditionDto, EditionPatch, PlanContent, PlanCreate, RankingPut } from '../../../../shared/api-contract';
import type { Action, AppState, Plan } from '@/domain/types';
import { placeById } from '@/fixtures/catalog';
import { canonicalCategory } from './bootstrap';
import type { AccountApi } from './api';
import { uploadPhoto } from './photos';

export function editionInput(state: AppState, action: Extract<Action, { type: 'ADD_EDITION' }>, photoPath?: string): EditionCreate {
  const edition = action.edition;
  if (edition.ownerId !== 'you') throw new Error('Only your own visits can be saved. Friend confirmations are demo-only.');
  if (!placeById(edition.placeId)?.canonical) throw new Error('Choose a place from the shared catalog.');
  if (edition.origin !== 'capture') throw new Error('Sample imports cannot be saved to an account.');
  return {
    requestId: edition.requestId, placeId: edition.placeId, capturedAt: edition.visitedAt,
    timezone: edition.timezone, note: edition.moment, companions: edition.companions,
    variant: edition.companions.length ? 'group' : state.editions.some(item => item.placeId === edition.placeId) ? 'revisit' : 'standard',
    photoPath: photoPath ?? null, origin: 'capture', outingId: edition.outingId ?? null, visibility: edition.visibility ?? 'private',
  };
}
export function planContent(plan: Plan, userId: string): PlanContent {
  return {
    title: plan.title, constraints: {
      participantIds: plan.constraints.participantIds.map(id => id === 'you' ? userId : id),
      date: plan.constraints.date, startMinute: plan.constraints.startMinute, endMinute: plan.constraints.endMinute,
      budgetCents: plan.constraints.budgetCents, transport: plan.constraints.transport, interests: plan.constraints.interests.map(category => canonicalCategory[category]),
      rain: plan.constraints.rain, excludedPlaceIds: plan.constraints.excludedPlaceIds, preferredPlaceIds: plan.constraints.preferredPlaceIds,
    },
    stops: plan.stops, totalCostCents: plan.totalCostCents, totalMinutes: plan.totalMinutes,
    checks: plan.checks, version: plan.version, provenance: plan.provenance ?? 'simulation',
  };
}
export async function mutateAccount(api: AccountApi, state: AppState, action: Action, persistDraft: (input: EditionCreate) => Promise<void>): Promise<void> {
  switch (action.type) {
    case 'ADD_EDITION': {
      if (action.edition.ownerId !== 'you') throw new Error('Friend confirmations are available only in demo mode.');
      const draft = state.captureDraft;
      if (!draft || draft.id !== action.edition.requestId) throw new Error('Start a new capture before saving this visit.');
      let input = draft.submittedEdition;
      if (!input) {
        input = editionInput(state, action);
        await persistDraft(input);
      }
      if (draft.photoUri && !input.photoPath) {
        input = { ...input, photoPath: await uploadPhoto(api, input.requestId, draft.photoUri) };
        await persistDraft(input);
      }
      await api.request<EditionDto>('/api/editions', 'POST', input);
      return;
    }
    case 'EDIT_EDITION':
      await api.request(`/api/editions/${action.id}`, 'PATCH', { note: action.patch.moment, capturedAt: action.patch.visitedAt, companions: action.patch.companions.map(name => name.trim()).filter(Boolean) } satisfies EditionPatch); return;
    case 'DELETE_EDITION': await api.request(`/api/editions/${action.id}`, 'DELETE'); return;
    case 'SAVE_PLACE':
    case 'COMPLETE_WISHLIST': {
      if (action.type === 'SAVE_PLACE' && action.userId && action.userId !== 'you') throw new Error('Only your own saves can be changed.');
      const list = state.wishlists.find(item => action.wishlistId === 'personal' ? item.isDefault : item.id === action.wishlistId);
      if (!list) throw new Error('The wishlist is unavailable. Refresh and try again.');
      const entry = list.entries.find(item => item.placeId === action.placeId);
      await api.request(`/api/wishlists/${list.id}/items`, 'PUT', {
        placeId: action.placeId, saved: action.type === 'COMPLETE_WISHLIST' || !entry?.saverIds.includes('you'),
        completed: action.type === 'COMPLETE_WISHLIST' ? true : entry?.completedBy.includes('you') ?? false,
      }); return;
    }
    case 'FAVORITE': await api.request(`/api/me/places/${action.placeId}`, 'PUT', { favorite: !state.favorites.includes(action.placeId) }); return;
    case 'TIP': await api.request(`/api/me/places/${action.placeId}`, 'PUT', { tip: action.text }); return;
    case 'ASSESS': {
      const place = placeById(action.assessment.placeId);
      if (!place) throw new Error('The destination is no longer available.');
      const input: RankingPut = { sentiment: action.assessment.sentiment, ranking: action.assessment.ranking, comparedTo: action.assessment.comparedTo ?? null, tiedWith: action.assessment.tiedWith ?? null };
      if (action.ranking) input.group = { category: canonicalCategory[place.category], sentiment: input.sentiment, placeIds: action.ranking.placeIds, provisionalIds: action.ranking.provisionalIds, ties: action.ranking.ties };
      await api.request(`/api/rankings/${place.id}`, 'PUT', input); return;
    }
    case 'ACCEPT_PLAN':
      await api.request('/api/outings', 'POST', { requestId: action.plan.requestId, wishlistId: action.plan.wishlistId ?? null, plan: planContent(action.plan, api.userId) } satisfies PlanCreate); return;
    case 'UPDATE_PLAN': await api.request(`/api/outings/${action.plan.id}`, 'PATCH', planContent(action.plan, api.userId)); return;
    case 'DELETE_PLAN': await api.request(`/api/outings/${action.id}`, 'DELETE'); return;
    case 'CREATE_WISHLIST': await api.request('/api/wishlists', 'POST', { requestId: action.requestId, name: action.name, isShared: action.isShared }); return;
    case 'ADD_MEMBER': await api.request(`/api/wishlists/${action.wishlistId}/members`, 'POST', { handle: action.handle }); return;
    case 'REMOVE_MEMBER': await api.request(`/api/wishlists/${action.wishlistId}/members/${action.userId}`, 'DELETE'); return;
    case 'PREFERENCES': {
      if (action.patch.name !== undefined || action.patch.homeCity !== undefined) await api.request('/api/me', 'PATCH', { displayName: action.patch.name, homeCity: action.patch.homeCity === undefined ? undefined : action.patch.homeCity || null });
      return;
    }
    default: throw new Error('This simulation is available only in demo mode.');
  }
}
