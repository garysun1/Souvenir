import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupMemoryPhotos } from "@/lib/server/memory-media-cleanup";
import { deleteEdition } from "@/lib/server/editions";
import type { AuthContext } from "../../shared/api-contract";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  remove: vi.fn(),
  lock: vi.fn(),
  deleted: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    transaction: async (run: (tx: object) => Promise<void>) =>
      run({
        select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }),
        delete: () => ({ where: () => ({ returning: mocks.deleted }) }),
      }),
  },
}));
vi.mock("@/lib/auth/storage", () => ({ deleteCapturePhoto: mocks.remove }));
vi.mock("@/lib/server/transactions", () => ({ lockUser: mocks.lock }));
vi.mock("@/lib/server/activity", () => ({ afterEditionChange: vi.fn() }));
vi.mock("@/lib/server/place-images", () => ({ revokeEditionPlaceImages: vi.fn() }));
vi.mock("@/lib/server/rankings", () => ({ removePlaceRanking: vi.fn() }));

const auth: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  mode: "bearer",
  email: null,
};
const path = `${auth.userId}/22222222-2222-4222-8222-222222222222.png`;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("photo retention across imports and visits", () => {
  it("deleting a confirmed imported visit retains its independent import moment's media", async () => {
    mocks.deleted.mockResolvedValueOnce([{ id: "visit", photoPath: path, placeId: "place" }]);
    mocks.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "retained-import" }]);
    await expect(deleteEdition(auth, "visit")).resolves.toEqual({ deleted: true });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deleting the last ordinary visit removes its unreferenced photo", async () => {
    mocks.deleted.mockResolvedValueOnce([{ id: "visit", photoPath: path, placeId: "place" }]);
    mocks.limit.mockResolvedValue([]);
    await expect(deleteEdition(auth, "visit")).resolves.toEqual({ deleted: true });
    expect(mocks.remove).toHaveBeenCalledWith(auth, path);
  });

  it("retains a deleted visit's media while an import item still owns it", async () => {
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "retained-import" }]);
    await cleanupMemoryPhotos(auth, [path]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("retains a deleted import's media while a confirmed visit still owns it", async () => {
    mocks.limit.mockResolvedValueOnce([{ id: "retained-visit" }]).mockResolvedValueOnce([]);
    await cleanupMemoryPhotos(auth, [path]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("removes an unreferenced object once under the account lock", async () => {
    mocks.limit.mockResolvedValue([]);
    mocks.remove.mockImplementation(async () => {
      expect(mocks.lock).toHaveBeenCalledWith(expect.any(Object), auth.userId);
    });
    await cleanupMemoryPhotos(auth, [path, path]);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith(auth, path);
  });

  it("fails closed when the reference lookup fails", async () => {
    mocks.limit.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(cleanupMemoryPhotos(auth, [path])).rejects.toThrow("database unavailable");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("propagates storage failures so receipt-based deletion retries remain possible", async () => {
    mocks.limit.mockResolvedValue([]);
    mocks.remove.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(cleanupMemoryPhotos(auth, [path])).rejects.toThrow("storage unavailable");
    await cleanupMemoryPhotos(auth, [path]);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
});
