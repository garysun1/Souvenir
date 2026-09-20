import type {
  EditionCreate,
  EditionDto,
  PhotoUploadDto,
  PhotoUploadRequest,
  Visibility,
  CollectionEntryDto,
} from "../../../shared/api-contract";
import type { ApiOptions } from "./api";

export interface CaptureDraft {
  requestId: string;
  placeId: string;
  capturedAt: string;
  timezone: string;
  note: string;
  companions: string;
  outingId: string | null;
  photo: Blob | null;
  photoName: string | null;
  submission: EditionCreate | null;
  completedEditionId: string | null;
  visibility?: Visibility;
}

const databaseName = "souvenir-web-drafts-v1";

export function similarVisit(draft: CaptureDraft, collection: CollectionEntryDto[]) {
  return collection.find(
    (edition) =>
      edition.requestId !== draft.requestId &&
      edition.placeId === draft.placeId &&
      Math.abs(Date.parse(edition.capturedAt) - Date.parse(draft.capturedAt)) < 60_000,
  );
}

async function draftStore<T>(
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("drafts");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () =>
      reject(new Error("This browser cannot save a capture draft. Enable site storage and retry."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("drafts", mode);
      const request = operation(transaction.objectStore("drafts"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () =>
        reject(new Error("Could not keep your draft on this device. Free some storage and retry."));
      transaction.onabort = () => reject(new Error("Draft storage was interrupted. Please retry."));
    });
  } finally {
    database.close();
  }
}

export function readCaptureDraft(userId: string): Promise<CaptureDraft | undefined> {
  return draftStore(
    (store) => store.get(userId) as IDBRequest<CaptureDraft | undefined>,
    "readonly",
  );
}

export async function writeCaptureDraft(userId: string, draft: CaptureDraft) {
  await draftStore((store) => store.put(draft, userId), "readwrite");
}

export async function removeCaptureDraft(userId: string) {
  await draftStore((store) => store.delete(userId), "readwrite");
}

export function photoMetadata(photo: Blob): Pick<PhotoUploadRequest, "contentType" | "size"> {
  if (photo.type !== "image/jpeg" && photo.type !== "image/png" && photo.type !== "image/webp") {
    throw new Error("Choose a JPEG, PNG or WebP photo.");
  }
  if (photo.size === 0 || photo.size > 10 * 1024 * 1024) {
    throw new Error("Choose a photo between 1 byte and 10 MiB.");
  }
  return { contentType: photo.type, size: photo.size };
}

export function capturePhotoPath(userId: string, requestId: string, photo: Blob) {
  const { contentType } = photoMetadata(photo);
  const extension =
    contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  return `${userId}/${requestId}.${extension}`;
}

interface CaptureTransport {
  request: <T>(path: string, options: ApiOptions) => Promise<T>;
  upload: (
    upload: Extract<PhotoUploadDto, { uploaded: false }>,
    bytes: ArrayBuffer,
    contentType: string,
  ) => Promise<void>;
}

export async function commitCapture(
  draft: CaptureDraft,
  transport: CaptureTransport,
): Promise<EditionDto> {
  if (!draft.submission) throw new Error("Confirm this draft before saving.");
  if (draft.photo) {
    const metadata = photoMetadata(draft.photo);
    const upload = await transport.request<PhotoUploadDto>("/api/capture/upload", {
      method: "POST",
      body: { requestId: draft.requestId, ...metadata } satisfies PhotoUploadRequest,
    });
    if (upload.path !== draft.submission.photoPath)
      throw new Error("The photo path did not match your draft. Please retry.");
    if (!upload.uploaded)
      await transport.upload(upload, await draft.photo.arrayBuffer(), metadata.contentType);
  }
  return transport.request<EditionDto>("/api/editions", { method: "POST", body: draft.submission });
}
