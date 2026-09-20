import type { AppState } from '@/domain/types';
import { emptyAccount } from './bootstrap';

export const accountKey = (userId: string) => `souvenir-account-v1:${userId}`;
export function encodeLocal(state: AppState) {
  return JSON.stringify({ version: 1, preferences: state.preferences, captureDraft: state.captureDraft });
}
export function restoreLocal(raw: string | null): AppState {
  const state = emptyAccount();
  if (!raw) return state;
  const input: unknown = JSON.parse(raw);
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1) throw new Error('Your local preferences could not be restored.');
  if ('preferences' in input && input.preferences && typeof input.preferences === 'object') {
    const prefs = input.preferences;
    if ('reducedMotion' in prefs && typeof prefs.reducedMotion === 'boolean') state.preferences.reducedMotion = prefs.reducedMotion;
    if ('bio' in prefs && typeof prefs.bio === 'string') state.preferences.bio = prefs.bio;
    if ('tastes' in prefs && Array.isArray(prefs.tastes)) state.preferences.tastes = prefs.tastes.filter((item): item is AppState['preferences']['tastes'][number] => ['park', 'cultural', 'landmark', 'food', 'hidden_gem'].includes(item));
    if ('collectionView' in prefs && (prefs.collectionView === 'list' || prefs.collectionView === 'album' || prefs.collectionView === 'map')) state.preferences.collectionView = prefs.collectionView;
    if ('collectionSection' in prefs && (prefs.collectionSection === 'been' || prefs.collectionSection === 'saved' || prefs.collectionSection === 'sets')) state.preferences.collectionSection = prefs.collectionSection;
  }
  if ('captureDraft' in input && input.captureDraft !== null && input.captureDraft !== undefined) {
    const draft = input.captureDraft;
    if (typeof draft !== 'object' || !('id' in draft) || typeof draft.id !== 'string'
      || !('visitedAt' in draft) || typeof draft.visitedAt !== 'string'
      || !('moment' in draft) || typeof draft.moment !== 'string'
      || !('companions' in draft) || !Array.isArray(draft.companions) || !draft.companions.every(item => typeof item === 'string')
      || !('status' in draft) || !['photo', 'identify', 'confirm', 'reveal', 'saved'].includes(String(draft.status))) throw new Error('The local capture draft could not be restored.');
    state.captureDraft = draft as AppState['captureDraft'];
  }
  return state;
}
