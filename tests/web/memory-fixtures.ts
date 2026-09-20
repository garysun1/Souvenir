import type {
  ImportItemDto,
  MemoryMomentDto,
  TasteProfileDto,
} from "../../shared/memories-contract";
import { editionId, placeId, userId } from "./fixtures";

export const batchId = "77777777-7777-4777-8777-777777777777";
export const itemId = "88888888-8888-4888-8888-888888888888";
export const momentId = "99999999-9999-4999-8999-999999999999";
export const albumId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const friendId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const capturedAt = "2026-09-20T01:00:00.000Z";
export const stop = { placeId, capturedAt, timezone: "America/Los_Angeles" };
export const item: ImportItemDto = {
  id: itemId,
  batchId,
  fileName: "synthetic.png",
  contentType: "image/png",
  sizeBytes: 8,
  sha256: "a".repeat(64),
  state: "uploaded",
  metadata: {
    capturedAt: null,
    timezone: null,
    latitude: null,
    longitude: null,
    accuracyM: null,
    origin: "unknown",
  },
  analysis: null,
  groupKey: null,
  confirmedStop: null,
  duplicateOfItemId: null,
  editionId: null,
  error: null,
  version: 1,
  createdAt: capturedAt,
  updatedAt: capturedAt,
};
export const moment: MemoryMomentDto = {
  id: momentId,
  authorId: userId,
  albumId: null,
  source: { kind: "edition", id: editionId },
  confirmedStop: stop,
  groupKey: null,
  note: "Explicitly shared words",
  version: 1,
  createdAt: capturedAt,
  updatedAt: capturedAt,
};
export const profile: TasteProfileDto = {
  userId,
  version: 2,
  draft: {
    title: "A private suggestion",
    facets: [{ interest: "gardens", intent: "enjoyed", strength: 2, evidenceIds: [itemId] }],
    coverage: "insufficient",
  },
  published: null,
  sharing: "private",
  overrides: [],
  preferences: { pace: null, budget: null, accessibility: "Private preferences" },
  titleOverride: null,
  selectedSources: [],
  excludedSources: [],
  collageMomentIds: [],
  evidence: [
    {
      id: itemId,
      source: { kind: "edition", id: editionId },
      interest: "gardens",
      intent: "enjoyed",
      confidence: 0.5,
      explanation: "Private evidence explanation",
      analysisVersion: 1,
      excluded: false,
    },
  ],
  analysisState: "ready",
  analysisVersion: 1,
  updatedAt: capturedAt,
};
