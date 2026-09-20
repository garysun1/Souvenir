import { z } from "zod";
import type { ApiOptions } from "@/lib/web/api";
import type {
  MemoryMomentCreate,
  MemoryMomentDto,
  MomentTagDto,
} from "../../../shared/memories-contract";

const uuid = z.string().uuid();
const source = z.object({ kind: z.enum(["edition", "import_item"]), id: uuid }).strict();
const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("private") }).strict(),
  z.object({ kind: z.literal("album"), albumId: uuid, confirmShare: z.literal(true) }).strict(),
]);
const request = z
  .object({
    requestId: uuid,
    source,
    target,
    note: z.string().max(2000).nullable(),
  })
  .strict() satisfies z.ZodType<MemoryMomentCreate>;

export const contributionProgressSchema = z
  .object({
    request,
    tags: z.array(z.object({ requestId: uuid, userId: uuid }).strict()).max(100),
    momentId: uuid.nullable(),
    completedTagUsers: z.array(uuid).max(100),
  })
  .strict();
export type ContributionProgress = z.infer<typeof contributionProgressSchema>;

export const contributionDraftSchema = z
  .object({
    version: z.literal(1),
    editionId: z.union([uuid, z.literal("")]),
    albumId: z.union([uuid, z.literal("")]),
    friendIds: z.array(uuid).max(100),
    note: z.string().max(2000),
    pending: contributionProgressSchema.nullable(),
    completedMomentId: uuid.nullable(),
  })
  .strict();
export type ContributionDraft = z.infer<typeof contributionDraftSchema>;

export async function submitContribution(
  initial: ContributionProgress,
  transport: { request: <T>(path: string, options: ApiOptions) => Promise<T> },
  persist: (progress: ContributionProgress) => void,
) {
  let progress = initial;
  persist(progress);
  if (!progress.momentId) {
    const moment = await transport.request<MemoryMomentDto>("/api/moments", {
      method: "POST",
      body: progress.request,
    });
    progress = { ...progress, momentId: moment.id };
    persist(progress);
  }
  for (const tag of progress.tags) {
    if (progress.completedTagUsers.includes(tag.userId)) continue;
    await transport.request<MomentTagDto>(`/api/moments/${progress.momentId}/tags`, {
      method: "POST",
      body: { ...tag, confirmShare: true },
    });
    progress = { ...progress, completedTagUsers: [...progress.completedTagUsers, tag.userId] };
    persist(progress);
  }
  return progress.momentId!;
}
