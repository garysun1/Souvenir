import { File } from 'expo-file-system';
import { resolveMedia } from './media';

export async function readPhotoBytes(id: string): Promise<ArrayBuffer> {
  if (!id.startsWith('media:')) throw new Error('Choose a photo from this device. Demo and remote photos cannot be uploaded.');
  const uri = await resolveMedia(id);
  if (!uri) throw new Error('The draft photo is missing on this device. Choose it again.');
  return new Uint8Array(await new File(uri).bytes()).buffer;
}
