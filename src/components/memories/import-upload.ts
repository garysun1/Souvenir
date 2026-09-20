import type { ApiOptions } from "@/lib/web/api";
import { photoMetadata } from "@/lib/web/capture";
import type { PhotoUploadDto } from "../../../shared/api-contract";
import type {
  ImportBatchDto,
  ImportItemCreate,
  ImportItemDto,
  ImportItemUploadDto,
} from "../../../shared/memories-contract";
import { readImageMetadata } from "./photo-metadata";

export interface PendingImage {
  file: Blob;
  registration: ImportItemCreate;
}

export async function prepareImage(file: File): Promise<PendingImage> {
  const { contentType, size } = photoMetadata(file);
  if (!file.name.trim() || file.name.length > 255 || /[/\\\u0000-\u001f]/.test(file.name))
    throw new Error(
      "Rename this photo to a simple file name of at most 255 characters, then select it again.",
    );
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    file,
    registration: {
      requestId: crypto.randomUUID(),
      sha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(
        "",
      ),
      fileName: file.name,
      contentType,
      sizeBytes: size,
      metadata: readImageMetadata(bytes, contentType),
    },
  };
}

async function queueStore<T>(
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("souvenir-memory-imports-v1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("queues");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(new Error("Enable browser storage to keep resumable uploads."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("queues", mode);
      const request = operation(transaction.objectStore("queues"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () =>
        reject(new Error("Could not save upload progress. Free device storage and retry."));
      transaction.onabort = () => reject(new Error("Upload progress could not be saved."));
    });
  } finally {
    database.close();
  }
}

export function readUploadQueue(userId: string, batchId: string) {
  return queueStore(
    (store) => store.get(`${userId}:${batchId}`) as IDBRequest<PendingImage[] | undefined>,
    "readonly",
  );
}
export async function saveUploadQueue(userId: string, batchId: string, queue: PendingImage[]) {
  if (queue.length)
    await queueStore((store) => store.put(queue, `${userId}:${batchId}`), "readwrite");
  else await queueStore((store) => store.delete(`${userId}:${batchId}`), "readwrite");
}

export interface ImportTransport {
  userId: string;
  request: <T>(path: string, options?: ApiOptions) => Promise<T>;
  upload: (upload: Extract<PhotoUploadDto, { uploaded: false }>, bytes: Blob) => Promise<void>;
}

export async function uploadImage(
  batchId: string,
  pending: PendingImage,
  transport: ImportTransport,
) {
  const path = `/api/imports/${batchId}`;
  const result = await transport.request<ImportItemUploadDto>(`${path}/items`, {
    method: "POST",
    body: pending.registration,
  });
  if (!result.upload || result.item.state === "duplicate") return result.item;
  if (result.upload.bucket !== "captures" || !result.upload.path.startsWith(`${transport.userId}/`))
    throw new Error("Upload destination does not belong to your account. Refresh before retrying.");
  if (!result.upload.uploaded) await transport.upload(result.upload, pending.file);
  const fresh = await transport.request<ImportBatchDto>(path);
  const item = fresh.items.find((item) => item.id === result.item.id);
  if (!item) throw new Error("This import item was removed. Refresh the batch.");
  if (item.state !== "pending_upload") return item;
  return transport.request<ImportItemDto>(`${path}/items/${item.id}/complete`, {
    method: "POST",
    body: { expectedVersion: item.version },
  });
}
