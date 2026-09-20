import type { Action, AppState } from '@/domain/types';
import { createSeed } from './seed';

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'RESET': return createSeed(action.mode);
    case 'PREFERENCES': return { ...state, preferences: { ...state.preferences, ...action.patch } };
    case 'CLOCK': return { ...state, clock: action.clock };
    case 'SAVE_PLACE': {
      const userId = action.userId ?? 'you';
      return { ...state, wishlists: state.wishlists.map(list => {
        if (list.id !== action.wishlistId || !list.memberIds.includes(userId)) return list;
        const existing = list.entries.find(entry => entry.placeId === action.placeId);
        return { ...list, entries: existing ? list.entries.map(entry => entry !== existing ? entry : {
          ...entry, saverIds: entry.saverIds.includes(userId) ? entry.saverIds.filter(id => id !== userId) : [...entry.saverIds, userId],
        }).filter(entry => entry.saverIds.length) : [...list.entries, { placeId: action.placeId, saverIds: [userId], completedBy: [] }] };
      }) };
    }
    case 'COMPLETE_WISHLIST': return { ...state, wishlists: state.wishlists.map(list => list.id !== action.wishlistId ? list : { ...list, entries: list.entries.map(entry => entry.placeId !== action.placeId ? entry : { ...entry, completedBy: [...new Set([...entry.completedBy, 'you'])] }) }) };
    case 'FAVORITE': return { ...state, favorites: state.favorites.includes(action.placeId) ? state.favorites.filter(id => id !== action.placeId) : [...state.favorites, action.placeId] };
    case 'TIP': return { ...state, tips: { ...state.tips, [action.placeId]: action.text.slice(0, 280) } };
    case 'DRAFT': return { ...state, captureDraft: action.draft };
    case 'ADD_EDITION': {
      const input = action.edition;
      if (state.editions.some(edition => edition.requestId === input.requestId) || (input.importSourceId && state.importedSourceIds.includes(input.importSourceId))) return state;
      const key = `${input.ownerId}:${input.placeId}`;
      const sequence = (state.sequences[key] ?? 0) + 1;
      const editions = [...state.editions, { ...input, sequence }];
      const plans = state.plans.map(plan => {
        const outing = state.outings.find(item => item.planId === plan.id);
        const completed = outing && plan.stops.every(stop => editions.some(edition => edition.ownerId === 'you' && edition.outingId === outing.id && edition.placeId === stop.placeId));
        return completed ? { ...plan, status: 'completed' as const } : plan;
      });
      return { ...state, editions, plans, sequences: { ...state.sequences, [key]: sequence },
        captureDraft: state.captureDraft?.id === input.requestId ? { ...state.captureDraft, status: 'saved', editionId: input.id } : state.captureDraft,
        importedSourceIds: input.importSourceId ? [...state.importedSourceIds, input.importSourceId] : state.importedSourceIds };
    }
    case 'EDIT_EDITION': return { ...state, editions: state.editions.map(edition => edition.id === action.id && edition.ownerId === 'you' ? { ...edition, ...action.patch } : edition) };
    case 'DELETE_EDITION': {
      const deleted = state.editions.find(edition => edition.id === action.id && edition.ownerId === 'you');
      if (!deleted) return state;
      const editions = state.editions.filter(edition => edition.id !== action.id);
      const remains = editions.some(edition => edition.ownerId === 'you' && edition.placeId === deleted.placeId);
      return { ...state, editions, assessments: remains ? state.assessments : state.assessments.filter(item => item.placeId !== deleted.placeId),
        rankings: remains ? state.rankings : state.rankings.map(rank => ({ ...rank, placeIds: rank.placeIds.filter(id => id !== deleted.placeId), provisionalIds: rank.provisionalIds.filter(id => id !== deleted.placeId), ties: rank.ties.filter(pair => !pair.includes(deleted.placeId)) })),
        captureDraft: state.captureDraft?.editionId === deleted.id ? null : state.captureDraft,
        plans: state.plans.map(plan => state.outings.some(outing => outing.id === deleted.outingId && outing.planId === plan.id) ? { ...plan, status: 'accepted' } : plan) };
    }
    case 'ASSESS': {
      if (!state.editions.some(edition => edition.ownerId === 'you' && edition.placeId === action.assessment.placeId)) return state;
      const rankings = state.rankings.map(rank => ({ ...rank, placeIds: rank.placeIds.filter(id => id !== action.assessment.placeId), provisionalIds: rank.provisionalIds.filter(id => id !== action.assessment.placeId), ties: rank.ties.filter(pair => !pair.includes(action.assessment.placeId)) }));
      return { ...state, assessments: [...state.assessments.filter(item => item.placeId !== action.assessment.placeId), action.assessment],
        rankings: action.ranking ? [...rankings.filter(rank => rank.key !== action.ranking?.key), action.ranking] : rankings };
    }
    case 'ACCEPT_PLAN': {
      if (state.plans.some(plan => plan.requestId === action.plan.requestId)) return state;
      return { ...state, plans: [...state.plans, action.plan], outings: [...state.outings, { id: `outing-${action.plan.id}`, planId: action.plan.id, title: action.plan.title, participantIds: action.plan.constraints.participantIds, placeIds: action.plan.stops.map(stop => stop.placeId) }] };
    }
    case 'IMPORT_ITEMS': return { ...state, importItems: action.items };
  }
}
