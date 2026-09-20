import type {
  AlbumInvitationDto, AlbumMemberDto, AlbumMemberInvite, ImportAnalyzeRequest, ImportBatchCreate,
  ImportBatchDto, ImportCommitDto, ImportCommitRequest, ImportItemCreate, ImportItemDto, ImportItemPatch,
  ImportItemUploadDto, InvitationRespond, MemoryDeletedDto, MemoryMomentCreate, MemoryMomentDto,
  MemoryMomentPatch, MemoryMutation, MemoryPageDto, MemoryPhotoDto, MomentTagCreate, MomentTagDto,
  MomentTagInvitationDto, TasteAnalyzeRequest, TasteComparisonDto, TasteComparisonQuery, TasteProfileDto,
  TasteProfilePatch, TastePublishRequest, TasteSharedProfileDto, TripAlbumCreate, TripAlbumDto, TripAlbumPatch,
} from '../../../../shared/memories-contract';
import type { AccountRequest } from './worldwide';
import { queryString } from './worldwide';

export const batchPath = (id: string) => `/api/imports/${encodeURIComponent(id)}`;
export const itemPath = (batchId: string, itemId: string) => `${batchPath(batchId)}/items/${encodeURIComponent(itemId)}`;
export const albumPath = (id: string) => `/api/albums/${encodeURIComponent(id)}`;
export const momentPath = (id: string) => `/api/moments/${encodeURIComponent(id)}`;
export const pagePath = (path: string, cursor?: string) => `${path}?${queryString({ limit: 25, cursor })}`;

export function memoriesApi(request: AccountRequest) {
  return {
    imports: (cursor?: string) => request<MemoryPageDto<ImportBatchDto>>(pagePath('/api/imports', cursor)),
    createBatch: (input: ImportBatchCreate) => request<ImportBatchDto>('/api/imports', 'POST', input),
    batch: (id: string) => request<ImportBatchDto>(batchPath(id)),
    deleteBatch: (id: string, input: MemoryMutation) => request<MemoryDeletedDto>(batchPath(id), 'DELETE', input),
    registerItem: (id: string, input: ImportItemCreate) => request<ImportItemUploadDto>(`${batchPath(id)}/items`, 'POST', input),
    patchItem: (batch: string, item: string, input: ImportItemPatch) => request<ImportItemDto>(itemPath(batch, item), 'PATCH', input),
    completeItem: (batch: string, item: string, input: MemoryMutation) => request<ImportItemDto>(`${itemPath(batch, item)}/complete`, 'POST', input),
    deleteItem: (batch: string, item: string, input: MemoryMutation) => request<MemoryDeletedDto>(itemPath(batch, item), 'DELETE', input),
    itemPhoto: (batch: string, item: string) => request<MemoryPhotoDto>(`${itemPath(batch, item)}/photo`),
    analyzeImport: (id: string, input: ImportAnalyzeRequest) => request<ImportBatchDto>(`${batchPath(id)}/analyze`, 'POST', input),
    commitImport: (id: string, input: ImportCommitRequest) => request<ImportCommitDto>(`${batchPath(id)}/commit`, 'POST', input),
    taste: () => request<TasteProfileDto>('/api/taste'),
    patchTaste: (input: TasteProfilePatch) => request<TasteProfileDto>('/api/taste', 'PATCH', input),
    deleteTaste: (input: MemoryMutation) => request<MemoryDeletedDto>('/api/taste', 'DELETE', input),
    analyzeTaste: (input: TasteAnalyzeRequest) => request<TasteProfileDto>('/api/taste/analyze', 'POST', input),
    publishTaste: (input: TastePublishRequest) => request<TasteProfileDto>('/api/taste/publish', 'POST', input),
    sharedTaste: (user: string) => request<TasteSharedProfileDto>(`/api/users/${encodeURIComponent(user)}/taste`),
    comparison: (user: string, query: TasteComparisonQuery = {}) => request<TasteComparisonDto>(`/api/users/${encodeURIComponent(user)}/taste-comparison?${queryString({ ...query })}`),
    albums: (cursor?: string) => request<MemoryPageDto<TripAlbumDto>>(pagePath('/api/albums', cursor)),
    createAlbum: (input: TripAlbumCreate) => request<TripAlbumDto>('/api/albums', 'POST', input),
    album: (id: string) => request<TripAlbumDto>(albumPath(id)),
    patchAlbum: (id: string, input: TripAlbumPatch) => request<TripAlbumDto>(albumPath(id), 'PATCH', input),
    deleteAlbum: (id: string, input: MemoryMutation) => request<MemoryDeletedDto>(albumPath(id), 'DELETE', input),
    members: (id: string, cursor?: string) => request<MemoryPageDto<AlbumMemberDto>>(pagePath(`${albumPath(id)}/members`, cursor)),
    inviteMember: (id: string, input: AlbumMemberInvite) => request<AlbumMemberDto>(`${albumPath(id)}/members`, 'POST', input),
    respondMember: (album: string, member: string, input: InvitationRespond) => request<AlbumMemberDto>(`${albumPath(album)}/members/${encodeURIComponent(member)}`, 'PATCH', input),
    albumInvitations: (cursor?: string) => request<MemoryPageDto<AlbumInvitationDto>>(pagePath('/api/album-invitations', cursor)),
    albumMoments: (id: string, cursor?: string) => request<MemoryPageDto<MemoryMomentDto>>(pagePath(`${albumPath(id)}/moments`, cursor)),
    moments: (cursor?: string) => request<MemoryPageDto<MemoryMomentDto>>(pagePath('/api/moments', cursor)),
    createMoment: (input: MemoryMomentCreate) => request<MemoryMomentDto>('/api/moments', 'POST', input),
    moment: (id: string) => request<MemoryMomentDto>(momentPath(id)),
    patchMoment: (id: string, input: MemoryMomentPatch) => request<MemoryMomentDto>(momentPath(id), 'PATCH', input),
    deleteMoment: (id: string, input: MemoryMutation) => request<MemoryDeletedDto>(momentPath(id), 'DELETE', input),
    momentPhoto: (id: string) => request<MemoryPhotoDto>(`${momentPath(id)}/photo`),
    tags: (id: string, cursor?: string) => request<MemoryPageDto<MomentTagDto>>(pagePath(`${momentPath(id)}/tags`, cursor)),
    inviteTag: (id: string, input: MomentTagCreate) => request<MomentTagDto>(`${momentPath(id)}/tags`, 'POST', input),
    respondTag: (moment: string, tag: string, input: InvitationRespond) => request<MomentTagDto>(`${momentPath(moment)}/tags/${encodeURIComponent(tag)}`, 'PATCH', input),
    tagInvitations: (cursor?: string) => request<MemoryPageDto<MomentTagInvitationDto>>(pagePath('/api/moment-tag-invitations', cursor)),
  };
}
