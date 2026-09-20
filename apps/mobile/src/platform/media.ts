import { Directory, File, Paths } from 'expo-file-system';
import { mediaFingerprint, mediaKey } from '@/domain/capture';

const directory = () => new Directory(Paths.document, 'souvenir-media');
export async function persistMedia(uri: string): Promise<string> {
  if (uri.startsWith('media:') || uri.startsWith('sample:')) return uri;
  const source = new File(uri);
  const extension = /\.(png|webp|heic|gif)$/i.exec(uri)?.[1].toLowerCase() ?? 'jpg';
  const key = `${mediaFingerprint(await source.bytes())}.${extension}`;
  const folder = directory();
  folder.create({ intermediates: true, idempotent: true });
  const target = new File(folder, key);
  if (!target.exists) source.copy(target);
  if (!target.exists || target.size === 0) throw new Error('The photo could not be saved on this device.');
  return `media:${key}`;
}
export async function resolveMedia(id: string): Promise<string | undefined> {
  if (!id.startsWith('media:')) return id;
  const key = mediaKey(id);
  if (!key) return undefined;
  try { const file = new File(directory(), key); return file.exists && file.size > 0 ? file.uri : undefined; } catch { return undefined; }
}
export function releaseMedia(_uri?: string) { /* Native document URIs need no release. */ }
export async function deleteMedia(id: string) { const key = mediaKey(id); if (key) { const file = new File(directory(), key); if (file.exists) file.delete(); } }
/** Reset can remove only media owned by this prototype. */
export async function clearMedia() { const folder = directory(); if (folder.exists) folder.delete(); }
