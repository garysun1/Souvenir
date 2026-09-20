export async function selectedPhotoBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The selected photo could not be read.');
  const blob = await response.blob();
  if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error('Choose an image no larger than 10 MiB.');
  return blob.arrayBuffer();
}
