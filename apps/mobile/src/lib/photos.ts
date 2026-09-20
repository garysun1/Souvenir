import type { PhotoUploadDto, PhotoUploadRequest } from '../../../../shared/api-contract';
import type { AccountApi } from './api';
import { getSupabase } from './supabase';
import { readPhotoBytes } from '@/platform/photoBytes';

export function photoType(bytes: ArrayBuffer): PhotoUploadRequest['contentType'] {
  const data = new Uint8Array(bytes);
  if (!data.length || data.length > 10 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP photo smaller than 10 MiB.');
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...data.slice(0, 4)) === 'RIFF' && String.fromCharCode(...data.slice(8, 12)) === 'WEBP') return 'image/webp';
  throw new Error('This photo format is unsupported. Choose a JPEG, PNG or WebP photo.');
}
export async function uploadPhoto(api: AccountApi, requestId: string, uri: string): Promise<string> {
  const bytes = await readPhotoBytes(uri);
  api.assertCurrent();
  const contentType = photoType(bytes);
  const upload = await api.request<PhotoUploadDto>('/api/capture/upload', 'POST', { requestId, contentType, size: bytes.byteLength } satisfies PhotoUploadRequest);
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
  if (upload.bucket !== 'captures' || upload.path !== `${api.userId}/${requestId}.${extension}`) throw new Error('The photo upload destination was invalid.');
  if (!upload.uploaded) {
    const { error } = await getSupabase().storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, bytes, { contentType });
    api.assertCurrent();
    if (error) throw new Error('The private photo upload failed. Retry this draft to check whether the upload completed.');
  }
  return upload.path;
}
