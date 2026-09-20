import { mediaFingerprint, mediaKey } from '@/domain/capture';

const DATABASE = 'souvenir-media-v1';
function openMedia(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Photo storage is unavailable in this browser. Try a sample photograph.')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Photo storage could not be opened.'));
    request.onblocked = () => reject(new Error('Close other Souvenir tabs and retry photo storage.'));
  });
}
export async function persistMedia(uri: string, contentHash?: string): Promise<string> {
  if (uri.startsWith('media:') || uri.startsWith('sample:')) return uri;
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The selected photo could not be read. Choose it again.');
  const blob = await response.blob();
  if (!blob.size) throw new Error('The selected photo is empty. Choose another photo.');
  const extension = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif' } as Record<string, string>)[blob.type] ?? 'jpg';
  if (contentHash && !/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('Invalid photo checksum.');
  const key = `${contentHash ?? mediaFingerprint(new Uint8Array(await blob.arrayBuffer()))}.${extension}`;
  const database = await openMedia();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('photos', 'readwrite');
      transaction.objectStore('photos').put(blob, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(new Error('Photo storage is full or unavailable. Your draft has not been replaced; retry or use a sample.'));
    });
  } finally { database.close(); }
  return `media:${key}`;
}
export async function resolveMedia(id: string): Promise<string | undefined> {
  if (!id.startsWith('media:')) return id;
  const key = mediaKey(id);
  if (!key) return undefined;
  let database: IDBDatabase | undefined;
  try {
    database = await openMedia();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const request = database!.transaction('photos', 'readonly').objectStore('photos').get(key);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
      request.onerror = () => reject(request.error);
    });
    return blob ? URL.createObjectURL(blob) : undefined;
  } catch { return undefined; } finally { database?.close(); }
}
export function releaseMedia(uri?: string) { if (uri?.startsWith('blob:')) URL.revokeObjectURL(uri); }
export async function deleteMedia(id: string) {
  const key = mediaKey(id); if (!key) return;
  const database = await openMedia();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('photos', 'readwrite');
    transaction.objectStore('photos').delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error('Could not remove the local photograph.'));
  }); } finally { database.close(); }
}
export async function clearMedia() {
  const database = await openMedia();
  try { await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('photos', 'readwrite');
    transaction.objectStore('photos').clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error('Could not clear local photographs.'));
  }); } finally { database.close(); }
}
