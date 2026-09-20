import type { AppState, Preferences } from '@/domain/types';
import { createSeed } from './seed';

type RecordValue = Record<string, unknown>;

export function migrateStoredState(value: unknown): AppState | null {
  if (!isRecord(value)) return null;
  if (value.version === 1) return isCurrentState(value) ? value as unknown as AppState : null;
  if (value.version !== 0) return null;
  const mode = value.mode === 'empty' ? 'empty' : 'sample';
  const base = createSeed(mode);
  const preferences = isRecord(value.preferences) ? value.preferences : {};
  return {
    ...base,
    clock: typeof value.clock === 'string' && !Number.isNaN(Date.parse(value.clock)) ? value.clock : base.clock,
    preferences: migratePreferences(base.preferences, preferences),
    editions: Array.isArray(value.editions) ? value.editions as AppState['editions'] : base.editions,
    sequences: isRecord(value.sequences) ? value.sequences as AppState['sequences'] : base.sequences,
    wishlists: Array.isArray(value.wishlists) ? value.wishlists as AppState['wishlists'] : base.wishlists,
    favorites: stringArray(value.favorites) ?? base.favorites,
    tips: stringRecord(value.tips) ?? base.tips,
    assessments: Array.isArray(value.assessments) ? value.assessments as AppState['assessments'] : base.assessments,
    rankings: Array.isArray(value.rankings) ? value.rankings as AppState['rankings'] : base.rankings,
    plans: Array.isArray(value.plans) ? value.plans as AppState['plans'] : base.plans,
    outings: Array.isArray(value.outings) ? value.outings as AppState['outings'] : base.outings,
    captureDraft: isRecord(value.captureDraft) ? value.captureDraft as unknown as AppState['captureDraft'] : null,
    importItems: Array.isArray(value.importItems) ? value.importItems as AppState['importItems'] : [],
    importedSourceIds: stringArray(value.importedSourceIds) ?? [],
  };
}

function migratePreferences(base: Preferences, value: RecordValue): Preferences {
  const tastes = stringArray(value.tastes)?.filter(item => item === 'park' || item === 'cultural' || item === 'landmark') as Preferences['tastes'] | undefined;
  return {
    ...base,
    onboardingComplete: typeof value.onboardingComplete === 'boolean' ? value.onboardingComplete : base.onboardingComplete,
    tastes: tastes?.length ? tastes : base.tastes,
    name: typeof value.name === 'string' ? value.name : base.name,
    handle: typeof value.handle === 'string' ? value.handle : base.handle,
    bio: typeof value.bio === 'string' ? value.bio : base.bio,
  };
}

function isCurrentState(value: RecordValue) {
  return Array.isArray(value.editions) && Array.isArray(value.wishlists) && isRecord(value.preferences)
    && Array.isArray(value.plans) && Array.isArray(value.outings) && isRecord(value.sequences)
    && Array.isArray(value.importItems) && Array.isArray(value.rankings) && Array.isArray(value.importedSourceIds);
}
function isRecord(value: unknown): value is RecordValue { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringArray(value: unknown) { return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null; }
function stringRecord(value: unknown) {
  if (!isRecord(value) || !Object.values(value).every(item => typeof item === 'string')) return null;
  return value as Record<string, string>;
}
