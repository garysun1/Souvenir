import type { AppState, Edition } from '@/domain/types';
export const DEMO_CLOCK = '2026-09-19T21:00:00.000Z';
const seedPlaces = ['la-central-library', 'la-griffith-observatory', 'la-echo-park', 'la-getty', 'la-venice-canals', 'la-union-station', 'la-echo-park'];
export function createSeed(mode: 'sample' | 'empty' = 'sample'): AppState {
  const editions: Edition[] = mode === 'empty' ? [] : seedPlaces.map((placeId, index) => ({
    id: `seed-${index}`, requestId: `seed-${index}`, placeId, ownerId: 'you',
    visitedAt: `2026-09-${String(18 - index).padStart(2, '0')}T20:00:00.000Z`, timezone: 'America/Los_Angeles',
    companions: index % 2 ? ['maya'] : [], moment: ['A little moment worth keeping.', 'The best kind of afternoon.', 'Found my new favorite corner.'][index % 3],
    sequence: index === 6 ? 2 : 1, origin: 'seed',
  }));
  return {
    version: 1, mode, clock: DEMO_CLOCK,
    preferences: { onboardingComplete: false, tastes: ['cultural', 'park'], collectionView: 'album', collectionSection: 'been', offline: false, reducedMotion: false, sourceStatus: 'sample', identifyFailure: false, name: 'You', handle: 'your_souvenir', bio: 'Collecting moments, not things.' },
    editions, sequences: Object.fromEntries(editions.map(edition => [`${edition.ownerId}:${edition.placeId}`, edition.sequence])),
    wishlists: [
      { id: 'personal', title: 'Just for me', memberIds: ['you'], entries: [] },
      { id: 'saturday-maya', title: 'Saturday with Maya', memberIds: ['you', 'maya'], entries: [
        { placeId: 'la-grand-park', saverIds: mode === 'sample' ? ['you', 'maya'] : ['maya'], completedBy: [] },
        { placeId: 'la-moca', saverIds: mode === 'sample' ? ['you', 'maya'] : ['maya'], completedBy: [] },
        { placeId: 'la-the-broad', saverIds: ['maya'], completedBy: [] },
        ...(mode === 'sample' ? [{ placeId: 'la-disney-hall', saverIds: ['you'], completedBy: [] }] : []),
      ] },
    ],
    favorites: mode === 'sample' ? ['la-central-library', 'la-echo-park'] : [],
    tips: mode === 'sample' ? { 'la-central-library': 'Look up at the painted ceilings.', 'la-getty': 'Leave time for the garden.' } : {},
    assessments: mode === 'sample' ? [{ placeId: 'la-central-library', sentiment: 'recommend', ranking: 'settled' }, { placeId: 'la-getty', sentiment: 'recommend', ranking: 'settled' }] : [],
    rankings: mode === 'sample' ? [{ key: 'cultural:recommend', placeIds: ['la-central-library', 'la-getty'], provisionalIds: [], ties: [] }] : [],
    plans: [], outings: [], captureDraft: null, importItems: [], importedSourceIds: [],
  };
}
