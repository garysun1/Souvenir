import type { ImportItem } from '@/domain/types';
export interface ImportPhoto extends ImportItem { fileName: string; contentHash: string; confidence: 'high' | 'low' | 'none'; previewPlaceId: string }
const visit = (id: string, placeId: string, day: string, hash: string): ImportPhoto => ({ id, placeId, visitedAt: `${day}T20:00:00.000Z`, selected: true, status: 'eligible', fileName: `LA-memory-${id}.jpg`, contentHash: hash, confidence: 'high', previewPlaceId: placeId });
export const importPhotos: ImportPhoto[] = [
  visit('01', 'la-the-broad', '2026-08-02', 'sample-broad-a'), visit('02', 'la-the-broad', '2026-08-16', 'sample-broad-b'),
  visit('03', 'la-grand-park', '2026-08-02', 'sample-park-a'), visit('04', 'la-grand-park', '2026-08-16', 'sample-park-b'),
  visit('05', 'la-central-library', '2026-08-03', 'sample-library-a'), visit('06', 'la-getty', '2026-08-04', 'sample-getty-a'),
  visit('07', 'la-echo-park', '2026-08-05', 'sample-echo-a'), visit('08', 'la-union-station', '2026-08-06', 'sample-union-a'),
  { ...visit('09', 'la-the-broad', '2026-08-02', 'sample-broad-a'), selected: false, status: 'duplicate' },
  { ...visit('10', 'la-getty', '2026-08-04', 'sample-getty-a'), selected: false, status: 'duplicate' },
  { ...visit('11', '', '2026-08-07', 'sample-uncertain-a'), selected: false, status: 'unresolved', confidence: 'low', previewPlaceId: 'la-bradbury' },
  { ...visit('12', '', '2026-08-08', 'sample-unsupported-a'), fileName: 'LA-memory-12.raw', selected: false, status: 'unsupported', confidence: 'none', previewPlaceId: '' },
];
export const initialImportItems = (): ImportItem[] => importPhotos.map(({ id, placeId, visitedAt, selected, status }) => ({ id, placeId, visitedAt, selected, status }));
export const importPhoto = (id: string) => importPhotos.find(photo => photo.id === id);
