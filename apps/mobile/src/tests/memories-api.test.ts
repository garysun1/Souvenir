import { memoriesApi, pagePath } from '@/lib/memoriesApi';
import type { AccountRequest } from '@/lib/worldwide';

test('memory pages put cursor and limit inside the data-list request without inventing legacy pagination', async () => {
  const send = jest.fn<Promise<unknown>, [string, string?, unknown?]>().mockResolvedValue({ items: [], nextCursor: null });
  const request: AccountRequest = async <T,>(path: string, method?: string, input?: unknown) => await send(path, method, input) as T;
  const api = memoriesApi(request);
  expect(pagePath('/api/imports', 'next')).toBe('/api/imports?limit=25&cursor=next');
  await api.imports(); await api.albums(); await api.moments(); await api.albumInvitations(); await api.tagInvitations();
  expect(send.mock.calls.map(call => call[0])).toEqual(['/api/imports?limit=25', '/api/albums?limit=25', '/api/moments?limit=25', '/api/album-invitations?limit=25', '/api/moment-tag-invitations?limit=25']);
});
test('tag acceptance targets the tag resource, never visits, source editions or album membership', async () => {
  const send = jest.fn<Promise<unknown>, [string, string?, unknown?]>().mockResolvedValue({});
  const request: AccountRequest = async <T,>(path: string, method?: string, input?: unknown) => await send(path, method, input) as T;
  const api = memoriesApi(request);
  await api.respondTag('moment', 'tag', { expectedVersion: 2, state: 'accepted' });
  expect(send.mock.calls).toEqual([['/api/moments/moment/tags/tag', 'PATCH', { expectedVersion: 2, state: 'accepted' }]]);
});
