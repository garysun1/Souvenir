import type { Action, AppState, Edition, ImportItem } from '@/domain/types';
import { placeById } from '@/fixtures/catalog';
import { importPhoto } from '@/fixtures/imports';
import { collectedPlaceIds, ownEditions } from '@/state/selectors';
import { validDay } from './collection';
export const importSourceId = (item: ImportItem) => `dropbox-demo:${importPhoto(item.id)?.contentHash ?? item.id}`;
export function canImport(item: ImportItem): boolean { return item.status === 'eligible' && !!placeById(item.placeId) && Number.isFinite(Date.parse(item.visitedAt)); }
export function correctImportItem(item: ImportItem, placeId: string, date: string, clock?: string): ImportItem {
  if (item.status === 'unsupported' || item.status === 'duplicate') throw new Error('This photo cannot be imported.');
  if (!placeById(placeId)) throw new Error('Choose a destination from the catalog.');
  if (!validDay(date)) throw new Error('Use a real date in YYYY-MM-DD format.');
  if (clock && Date.parse(`${date}T20:00:00.000Z`) > Date.parse(clock)) throw new Error('Choose a visit date on or before the demo clock.');
  return { ...item, placeId, visitedAt: `${date}T20:00:00.000Z`, selected: true, status: 'eligible' };
}
export function importCandidates(state: AppState, items: ImportItem[]): ImportItem[] {
  const seen = new Set(state.importedSourceIds);
  return items.filter(item => { if (!item.selected || !canImport(item)) return false; const source = importSourceId(item); if (seen.has(source)) return false; seen.add(source); return true; });
}
export function editionForImport(item: ImportItem): Omit<Edition, 'sequence'> {
  const source = importSourceId(item);
  const previewPlaceId = importPhoto(item.id)?.previewPlaceId;
  return { id: `edition-${source}`, requestId: source, importSourceId: source, placeId: item.placeId, photoUri: previewPlaceId ? `sample:${previewPlaceId}` : undefined, ownerId: 'you', visitedAt: item.visitedAt, timezone: 'America/Los_Angeles', companions: [], moment: '', origin: 'import' };
}
export interface ImportSummary { createdEditions: number; newPlaces: number; duplicatesSkipped: number; unresolved: number; unsupported: number; deselected: number }
export function summarizeImport(before: AppState, after: AppState, items: ImportItem[]): ImportSummary {
  const beforeIds = new Set(ownEditions(before).map(edition => edition.id)); const sources = new Set(items.map(importSourceId));
  const created = ownEditions(after).filter(edition => !beforeIds.has(edition.id) && !!edition.importSourceId && sources.has(edition.importSourceId)); const ownedBefore = new Set(collectedPlaceIds(before));
  const duplicates = new Set(before.importedSourceIds); let duplicatesSkipped = 0;
  for (const item of items) { if (item.status === 'duplicate') { duplicatesSkipped++; continue; } if (!item.selected || !canImport(item)) continue; const source = importSourceId(item); if (duplicates.has(source)) duplicatesSkipped++; duplicates.add(source); }
  return { createdEditions: created.length, newPlaces: new Set(created.filter(edition => !ownedBefore.has(edition.placeId)).map(edition => edition.placeId)).size, duplicatesSkipped, unresolved: items.filter(item => item.status === 'unresolved').length, unsupported: items.filter(item => item.status === 'unsupported').length, deselected: items.filter(item => item.status === 'eligible' && !item.selected).length };
}
export async function commitImport(before: AppState, items: ImportItem[], commit: (action: Action) => Promise<AppState>): Promise<{ state: AppState; summary: ImportSummary }> {
  let after = await commit({ type: 'IMPORT_ITEMS', items });
  for (const item of importCandidates(after, items)) after = await commit({ type: 'ADD_EDITION', edition: editionForImport(item) });
  return { state: after, summary: summarizeImport(before, after, items) };
}
