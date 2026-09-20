import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digest, randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type { ImportItemCreate, ImportItemDto } from '../../../../shared/memories-contract';
import { assertUploadDestination, importMetadata } from '@/domain/memories';
import { persistMedia } from '@/platform/media';
import { readPhotoBytes } from '@/platform/photoBytes';
import { selectedPhotoBytes } from '@/platform/selectedPhotoBytes';
import { memoriesApi } from './memoriesApi';
import { memoryStorageKey } from './memoryJournal';
import { photoType } from './photos';
import { getSupabase } from './supabase';
import type { AccountRequest } from './worldwide';

export interface LocalImportPhoto { mediaId: string; input: ImportItemCreate }
export interface ImportSelection { photos: LocalImportPhoto[]; problems: string[] }
export async function sha256(bytes: ArrayBuffer) {
  const hash = await digest(CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}
export const importQueueKey = (userId: string, batchId: string) => memoryStorageKey(userId, `uploads:${batchId}`);
export async function readImportQueue(userId: string, batchId: string): Promise<LocalImportPhoto[]> {
  const raw = await AsyncStorage.getItem(importQueueKey(userId, batchId));
  return raw ? JSON.parse(raw) as LocalImportPhoto[] : [];
}
export async function selectImportPhotos(remaining: number, assertCurrent: () => void): Promise<ImportSelection> {
  if (remaining < 1) throw new Error('This batch already contains 20 photos. Start a new batch.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining,
    orderedSelection: true, allowsEditing: false, quality: 1, exif: true,
  });
  assertCurrent();
  if (result.canceled) return { photos: [], problems: [] };
  const photos: LocalImportPhoto[] = [];
  const problems: string[] = [];
  if (result.assets.length > remaining) problems.push(`Only the first ${remaining} photos fit in this batch.`);
  for (const asset of result.assets.slice(0, remaining)) {
    try {
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) throw new Error('Choose a file no larger than 10 MiB.');
      if (asset.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)) throw new Error('Export this photo as JPEG, PNG or WebP first.');
      const bytes = await selectedPhotoBytes(asset.uri);
      assertCurrent();
      const contentType = photoType(bytes);
      const hash = await sha256(bytes);
      assertCurrent();
      const mediaId = await persistMedia(asset.uri, hash);
      assertCurrent();
      photos.push({ mediaId, input: {
        requestId: randomUUID(), sha256: hash, fileName: (asset.fileName ?? `Photo ${photos.length + 1}`).slice(0, 255),
        contentType, sizeBytes: bytes.byteLength, metadata: importMetadata(asset.exif),
      } });
    } catch (reason) {
      assertCurrent();
      problems.push(`${asset.fileName ?? 'Selected photo'}: ${reason instanceof Error ? reason.message : 'Could not read this image.'}`);
    }
  }
  return { photos, problems };
}

export async function uploadImportPhoto(
  request: AccountRequest, assertCurrent: () => void, userId: string, batchId: string, photo: LocalImportPhoto,
): Promise<ImportItemDto> {
  const api = memoriesApi(request);
  const bytes = await readPhotoBytes(photo.mediaId);
  assertCurrent();
  if (bytes.byteLength !== photo.input.sizeBytes || photoType(bytes) !== photo.input.contentType || await sha256(bytes) !== photo.input.sha256) {
    throw new Error('This local photo changed. Remove it from the upload queue and select it again.');
  }
  assertCurrent();
  const registered = await api.registerItem(batchId, photo.input);
  assertCurrent();
  if (registered.item.state === 'duplicate') return registered.item;
  if (registered.upload && !registered.upload.uploaded) {
    assertUploadDestination(registered.upload.bucket, registered.upload.path, userId);
    const { error } = await getSupabase().storage.from(registered.upload.bucket).uploadToSignedUrl(
      registered.upload.path, registered.upload.token, bytes, { contentType: photo.input.contentType },
    );
    assertCurrent();
    if (error) throw new Error('Upload was interrupted. Retry to renew credentials and verify the stored photo.');
  }
  const current = (await api.batch(batchId)).items.find(item => item.id === registered.item.id);
  if (!current) throw new Error('The item was removed from this batch.');
  if (current.state !== 'pending_upload') return current;
  return api.completeItem(batchId, current.id, { expectedVersion: current.version });
}
