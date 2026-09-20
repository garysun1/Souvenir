/** @jest-environment jsdom */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAccountResource } from '@/lib/useAccountResource';
import { useAccountMutation } from '@/lib/useAccountMutation';
import { ApiError } from '@/lib/api';

jest.mock('@/state/AppProvider', () => ({ useApp: () => mockService }));
const read = jest.fn<Promise<unknown>, [string]>();
const write = jest.fn<Promise<unknown>, [string, string, unknown?]>();
const request = async <T,>(path: string): Promise<T> => await read(path) as T;
const mockService = { accountRequest: request, accountRevision: 0, accountWrite: async <T,>(path: string, method: string, input?: unknown): Promise<T> => await write(path, method, input) as T };
let resource: ReturnType<typeof useAccountResource<{ name: string }>>;
let mutation: ReturnType<typeof useAccountMutation>;
let root: Root;
function Observe({ path }: { path?: string }) {
  const data = useAccountResource<{ name: string }>(path);
  const change = useAccountMutation();
  useEffect(() => { resource = data; mutation = change; }, [data, change]);
  return null;
}
const deferred = () => {
  let resolve: (data: { name: string }) => void = () => { throw new Error('Not pending'); };
  const promise = new Promise<{ name: string }>(done => { resolve = done; });
  return { promise, resolve };
};
beforeEach(() => {
  read.mockReset(); write.mockReset();
  mockService.accountRevision = 0; mockService.accountRequest = request;
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); });
test('older resource replies cannot overwrite a newer query or account identity', async () => {
  const old = deferred(); const next = deferred();
  read.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  await act(async () => root.render(<Observe path="/old" />));
  await act(async () => root.render(<Observe path="/new" />));
  await act(async () => next.resolve({ name: 'New destination' }));
  await act(async () => old.resolve({ name: 'Old destination' }));
  expect(resource.data?.name).toBe('New destination');
  const account = deferred();
  mockService.accountRequest = async <T,>(): Promise<T> => await account.promise as T;
  await act(async () => root.render(<Observe path="/new" />));
  expect(resource.data).toBeUndefined();
  expect(resource.loading).toBe(true);
  await act(async () => account.resolve({ name: 'New account' }));
  expect(resource.data?.name).toBe('New account');
});
test('same-path refresh retains forms, but revoked access discards private cached results', async () => {
  read.mockResolvedValueOnce({ name: 'Private destination' });
  await act(async () => root.render(<Observe path="/private" />));
  const pending = deferred(); read.mockReturnValueOnce(pending.promise);
  mockService.accountRevision++;
  await act(async () => root.render(<Observe path="/private" />));
  expect(resource.data?.name).toBe('Private destination');
  expect(resource.loading).toBe(true);
  await act(async () => pending.resolve({ name: 'Refreshed' }));
  read.mockRejectedValueOnce(new ApiError('Not visible', 404));
  await act(async () => resource.reload());
  expect(resource.data).toBeUndefined();
  expect(resource.error).toBe('Not visible');
});
test('mutation retry preserves the first request after network ambiguity and unlocks after success', async () => {
  await act(async () => root.render(<Observe />));
  write.mockRejectedValueOnce(new ApiError('Offline'));
  await act(async () => { await expect(mutation.run('/api/places', 'POST', { requestId: 'one', name: 'Original' })).rejects.toThrow('Offline'); });
  expect(mutation.locked).toBe(true);
  write.mockResolvedValueOnce({ id: 'created' });
  await act(async () => { await mutation.run('/api/places', 'POST', { requestId: 'two', name: 'Changed' }); });
  expect(write.mock.calls[0]).toEqual(write.mock.calls[1]);
  expect(mutation.locked).toBe(false);
  expect(mutation.error).toBeUndefined();
});
