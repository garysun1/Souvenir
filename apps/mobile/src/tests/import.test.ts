import { commitImport, correctImportItem, editionForImport, importCandidates, summarizeImport } from '@/domain/import';
import type { Action } from '@/domain/types';
import { importPhotos, initialImportItems } from '@/fixtures/imports';
import { createSeed } from '@/state/seed';
import { reducer } from '@/state/reducer';

test('fixture has exactly 12 photos and promised review outcomes', () => {
  const items = initialImportItems(); expect(items).toHaveLength(12); expect(items.filter(item => item.status === 'eligible')).toHaveLength(8);
  expect(items.filter(item => item.status === 'duplicate')).toHaveLength(2); expect(items.filter(item => item.status === 'unresolved')).toHaveLength(1); expect(items.filter(item => item.status === 'unsupported')).toHaveLength(1);
  expect(new Set(items.filter(item => item.status === 'eligible').map(item => item.placeId)).size).toBe(6);
});
test('manual correction makes a low-confidence item eligible and rejects impossible dates', () => {
  const unresolved = initialImportItems()[10]; expect(correctImportItem(unresolved, 'la-bradbury', '2026-08-07').status).toBe('eligible');
  expect(() => correctImportItem(unresolved, 'la-bradbury', '2026-02-29')).toThrow();
  const corrected = correctImportItem(unresolved, 'la-central-library', '2026-08-07');
  expect(editionForImport(corrected).photoUri).toBe('sample:la-bradbury');
  expect(() => correctImportItem(unresolved, 'la-bradbury', '2027-01-01', createSeed().clock)).toThrow();
});
test('import candidates deduplicate hashes and repeated import summaries actual mutations', () => {
  const before = createSeed(); const items = initialImportItems(); const candidates = importCandidates(before, items); expect(candidates).toHaveLength(8);
  let after = before; for (const item of candidates) after = reducer(after, { type: 'ADD_EDITION', edition: editionForImport(item) });
  const summary = summarizeImport(before, after, items); expect(summary).toMatchObject({ createdEditions: 8, newPlaces: 2, duplicatesSkipped: 2, unresolved: 1, unsupported: 1 });
  expect(importCandidates(after, items)).toHaveLength(0); expect(summarizeImport(after, after, items).duplicatesSkipped).toBe(10);
  expect(new Set(importPhotos.map(photo => photo.contentHash)).size).toBe(10);
});
test('review survives a partial persistence failure and retry imports only the remainder', async () => {
  let persisted = createSeed(); const items = initialImportItems(); let additions = 0;
  const failingCommit = async (action: Action) => {
    if (action.type === 'ADD_EDITION' && additions++ === 2) throw new Error('Storage unavailable');
    persisted = reducer(persisted, action); return persisted;
  };
  await expect(commitImport(persisted, items, failingCommit)).rejects.toThrow('Storage unavailable');
  expect(persisted.importItems).toEqual(items);
  expect(persisted.importedSourceIds).toHaveLength(2);
  const resumed = await commitImport(persisted, items, async action => { persisted = reducer(persisted, action); return persisted; });
  expect(resumed.summary.createdEditions).toBe(6);
  expect(resumed.summary.duplicatesSkipped).toBe(4);
  expect(persisted.importedSourceIds).toHaveLength(8);
});
