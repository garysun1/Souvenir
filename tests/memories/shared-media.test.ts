import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getMemoryPhoto } from "@/lib/server/memory-sharing-media";
import { ApiError } from "@/lib/server/errors";

const mocks = vi.hoisted(() => ({
  where: vi.fn(),
  requireMoment: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}));
vi.mock("@/lib/server/memory-sharing-access", () => ({ requireMoment: mocks.requireMoment }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "https://storage.test", SUPABASE_SECRET_KEY: "synthetic" },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrl: mocks.sign }) } }),
}));

const owner = "11111111-1111-4111-8111-111111111111";
const friend = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const uploadId = "44444444-4444-4444-8444-444444444444";
const itemId = "55555555-5555-4555-8555-555555555555";
const editionId = "66666666-6666-4666-8666-666666666666";
const momentId = "77777777-7777-4777-8777-777777777777";
const importedPath = `${owner}/${uploadId}.png`;
const importedEdition = {
  requestId,
  path: importedPath,
  importSourceId: `memory:${itemId}`,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireMoment.mockResolvedValue({
    authorId: owner,
    sourceEditionId: editionId,
    sourceImportItemId: null,
  });
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.test/signed" }, error: null });
});

describe("shared memory media across capture and import", () => {
  it("signs an imported visit using its durable owner-scoped upload receipt", async () => {
    mocks.where
      .mockResolvedValueOnce([importedEdition])
      .mockResolvedValueOnce([{ requestId: uploadId }]);
    const result = await getMemoryPhoto(friend, momentId);
    expect(result).toEqual({ url: "https://storage.test/signed", expiresAt: expect.any(String) });
    expect(mocks.sign).toHaveBeenCalledWith(importedPath, 300);
    expect(mocks.requireMoment).toHaveBeenNthCalledWith(1, friend, momentId);
    expect(mocks.requireMoment).toHaveBeenNthCalledWith(2, friend, momentId);
    const receiptQuery = new PgDialect().sqlToQuery(mocks.where.mock.calls[1][0]);
    expect(receiptQuery.params).toEqual([owner, "import.item.create", itemId, importedPath]);
  });

  it("keeps existing capture and direct import photo paths working", async () => {
    const path = `${owner}/${requestId}.jpg`;
    mocks.where.mockResolvedValueOnce([{ requestId, path, importSourceId: null }]);
    await getMemoryPhoto(friend, momentId);
    mocks.requireMoment.mockResolvedValue({
      authorId: owner,
      sourceEditionId: null,
      sourceImportItemId: itemId,
    });
    mocks.where.mockResolvedValueOnce([{ requestId, path }]);
    await getMemoryPhoto(friend, momentId);
    expect(mocks.sign).toHaveBeenCalledTimes(2);
    expect(mocks.sign).toHaveBeenLastCalledWith(path, 300);
  });

  it("does not sign an imported visit without its matching owner/path receipt", async () => {
    mocks.where.mockResolvedValueOnce([importedEdition]).mockResolvedValueOnce([]);
    await expect(getMemoryPhoto(friend, momentId)).rejects.toMatchObject({ status: 404 });
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it.each([
    `${friend}/${uploadId}.png`,
    `${owner}/../${uploadId}.png`,
    `${owner}/${requestId}.png`,
    `https://storage.test/${importedPath}`,
  ])("rejects a stored path outside the authorized original upload: %s", async (path) => {
    mocks.where
      .mockResolvedValueOnce([{ ...importedEdition, path }])
      .mockResolvedValueOnce([{ requestId: uploadId }]);
    await expect(getMemoryPhoto(friend, momentId)).rejects.toMatchObject({ status: 404 });
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("does not read a private source for an unauthorized third user", async () => {
    mocks.requireMoment.mockRejectedValueOnce(new ApiError(404, "not_found", "Unavailable"));
    await expect(getMemoryPhoto(itemId, momentId)).rejects.toMatchObject({ status: 404 });
    expect(mocks.where).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("rechecks revocation after resolving the source and before signing", async () => {
    mocks.where
      .mockResolvedValueOnce([importedEdition])
      .mockResolvedValueOnce([{ requestId: uploadId }]);
    mocks.requireMoment
      .mockResolvedValueOnce({ authorId: owner, sourceEditionId: editionId })
      .mockRejectedValueOnce(new ApiError(404, "not_found", "Unavailable"));
    await expect(getMemoryPhoto(friend, momentId)).rejects.toMatchObject({ status: 404 });
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
