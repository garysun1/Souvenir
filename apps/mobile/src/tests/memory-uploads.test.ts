import { digest } from 'expo-crypto';
import { launchImageLibraryAsync } from 'expo-image-picker';
import type { ImportItemDto } from '../../../../shared/memories-contract';
import { AccountScope } from '@/lib/api';
import { selectImportPhotos, uploadImportPhoto, type LocalImportPhoto } from '@/lib/memoryUploads';
import { getSupabase } from '@/lib/supabase';
import type { AccountRequest } from '@/lib/worldwide';
import { persistMedia } from '@/platform/media';
import { readPhotoBytes } from '@/platform/photoBytes';
import { selectedPhotoBytes } from '@/platform/selectedPhotoBytes';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ digest: jest.fn(), CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/platform/media', () => ({ persistMedia: jest.fn() }));
jest.mock('@/platform/photoBytes', () => ({ readPhotoBytes: jest.fn() }));
jest.mock('@/platform/selectedPhotoBytes', () => ({ selectedPhotoBytes: jest.fn() }));
jest.mock('@/lib/supabase', () => {
  const uploadToSignedUrl = jest.fn(async () => ({ error: null }));
  return { getSupabase: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }) };
});
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
const hash = '07'.repeat(32);
const item: ImportItemDto = {
  id: 'item', batchId: 'batch', fileName: 'synthetic.jpg', contentType: 'image/jpeg', sizeBytes: 4, sha256: hash,
  state: 'pending_upload', metadata: { capturedAt: null, timezone: null, latitude: null, longitude: null, accuracyM: null, origin: 'unknown' },
  analysis: null, confirmedStop: null, groupKey: null, duplicateOfItemId: null, editionId: null, error: null,
  version: 1, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
};
const photo: LocalImportPhoto = { mediaId: 'media:synthetic.jpg', input: { requestId: 'request', sha256: hash, fileName: item.fileName, contentType: item.contentType, sizeBytes: 4, metadata: item.metadata } };
const upload = jest.mocked(getSupabase().storage.from('captures').uploadToSignedUrl);
const signed = { bucket: 'captures', path: 'alice/upload.jpg', token: 'scoped', signedUrl: 'https://test/upload', uploaded: false };
function setup() {
  const scope = new AccountScope();
  const send = jest.fn<Promise<unknown>, [string, string?, unknown?]>();
  const request: AccountRequest = async <T,>(path: string, method?: string, input?: unknown) => await send(path, method, input) as T;
  return { scope, send, request };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(digest).mockResolvedValue(new Uint8Array(32).fill(7).buffer);
  jest.mocked(readPhotoBytes).mockResolvedValue(bytes);
  jest.mocked(selectedPhotoBytes).mockResolvedValue(bytes);
  jest.mocked(persistMedia).mockResolvedValue(photo.mediaId);
});
test('device selection bounds formats and count, hashes original bytes and retains partial valid selection', async () => {
  jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [
    { uri: 'file:///valid.jpg', width: 10, height: 10, mimeType: 'image/jpeg', fileName: 'synthetic.jpg' },
    { uri: 'file:///bad.heic', width: 10, height: 10, mimeType: 'image/heic', fileName: 'unsupported.heic' },
  ] });
  const { photos, problems } = await selectImportPhotos(2, () => undefined);
  expect(photos).toHaveLength(1);
  expect(photos[0].input.sha256).toBe(hash);
  expect(persistMedia).toHaveBeenCalledWith('file:///valid.jpg', hash);
  expect(problems[0]).toContain('JPEG, PNG or WebP');
  expect(launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 2, exif: true, allowsEditing: false }));
});
test('oversized declared image is refused before reading bytes', async () => {
  jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///large.jpg', width: 10, height: 10, mimeType: 'image/jpeg', fileSize: 10 * 1024 * 1024 + 1 }] });
  expect((await selectImportPhotos(1, () => undefined)).photos).toEqual([]);
  expect(selectedPhotoBytes).not.toHaveBeenCalled();
});
test('picker cancel is not an error and a full batch never opens the picker', async () => {
  jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
  await expect(selectImportPhotos(1, () => undefined)).resolves.toEqual({ photos: [], problems: [] });
  await expect(selectImportPhotos(0, () => undefined)).rejects.toThrow('20 photos');
  expect(launchImageLibraryAsync).toHaveBeenCalledTimes(1);
});
test('upload registers immutable metadata, writes owned bytes and completes using the latest server version', async () => {
  const { scope, send, request } = setup();
  send.mockResolvedValueOnce({ item, upload: signed }).mockResolvedValueOnce({ items: [{ ...item, version: 4 }] }).mockResolvedValueOnce({ ...item, state: 'uploaded', version: 5 });
  await expect(uploadImportPhoto(request, scope.capture().assertCurrent, 'alice', 'batch', photo)).resolves.toMatchObject({ state: 'uploaded' });
  expect(send.mock.calls[0]).toEqual(['/api/imports/batch/items', 'POST', photo.input]);
  expect(upload).toHaveBeenCalledWith('alice/upload.jpg', 'scoped', bytes, { contentType: 'image/jpeg' });
  expect(send.mock.calls[2]).toEqual(['/api/imports/batch/items/item/complete', 'POST', { expectedVersion: 4 }]);
});
test('duplicate registrations never upload or complete again', async () => {
  const { scope, send, request } = setup();
  send.mockResolvedValueOnce({ item: { ...item, state: 'duplicate' }, upload: null });
  await expect(uploadImportPhoto(request, scope.capture().assertCurrent, 'alice', 'batch', photo)).resolves.toMatchObject({ state: 'duplicate' });
  expect(upload).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
});
test('lost completion response resumes from server state without uploading or committing another moment', async () => {
  const { scope, send, request } = setup();
  send.mockResolvedValueOnce({ item, upload: { ...signed, uploaded: true, token: null, signedUrl: null } }).mockResolvedValueOnce({ items: [{ ...item, state: 'uploaded' }] });
  await expect(uploadImportPhoto(request, scope.capture().assertCurrent, 'alice', 'batch', photo)).resolves.toMatchObject({ state: 'uploaded' });
  expect(upload).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(2);
});
test('cross-owner signed destinations are rejected before storage sees bytes', async () => {
  const { scope, send, request } = setup();
  send.mockResolvedValueOnce({ item, upload: { ...signed, path: 'bob/upload.jpg' } });
  await expect(uploadImportPhoto(request, scope.capture().assertCurrent, 'alice', 'batch', photo)).rejects.toThrow('destination');
  expect(upload).not.toHaveBeenCalled();
});
test('changed stored image cannot be sent under a persisted request identity', async () => {
  const { scope, send, request } = setup();
  jest.mocked(digest).mockResolvedValueOnce(new Uint8Array(32).fill(8).buffer);
  await expect(uploadImportPhoto(request, scope.capture().assertCurrent, 'alice', 'batch', photo)).rejects.toThrow('changed');
  expect(send).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
});
test('switching accounts while reading a queued photo prevents both registration and storage upload', async () => {
  const { scope, send, request } = setup();
  const captured = scope.capture();
  jest.mocked(readPhotoBytes).mockImplementationOnce(async () => { scope.change(); return bytes; });
  await expect(uploadImportPhoto(request, captured.assertCurrent, 'alice', 'batch', photo)).rejects.toMatchObject({ code: 'account_changed' });
  expect(send).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
});
