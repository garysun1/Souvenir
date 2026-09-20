import { File } from 'expo-file-system';

export async function selectedPhotoBytes(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri);
  if (!file.exists || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose a local image no larger than 10 MiB.');
  return new Uint8Array(await file.bytes()).buffer;
}
