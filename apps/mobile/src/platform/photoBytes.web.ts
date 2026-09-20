import { releaseMedia, resolveMedia } from './media';

export async function readPhotoBytes(id: string): Promise<ArrayBuffer> {
  if (!id.startsWith('media:')) throw new Error('Choose a photo from this device. Demo and remote photos cannot be uploaded.');
  const uri = await resolveMedia(id);
  if (!uri) throw new Error('The draft photo is missing on this device. Choose it again.');
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('The draft photo could not be read.');
    return await response.arrayBuffer();
  } finally { releaseMedia(uri); }
}
