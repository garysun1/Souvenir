import { AccountScope, ApiError } from '@/lib/api';
import { MemoryJournal, memoryStorageKey, type JournalStorage, type MemoryOperation } from '@/lib/memoryJournal';
import type { AccountRequest } from '@/lib/worldwide';

const operation: MemoryOperation = { label: 'create memory', path: '/api/moments', method: 'POST', input: { requestId: 'original', source: { kind: 'edition', id: 'owned' }, target: { kind: 'private' } } };
function setup() {
  const data = new Map<string, string>();
  const storage: JournalStorage = {
    getItem: jest.fn(async key => data.get(key) ?? null),
    setItem: jest.fn(async (key, value) => { data.set(key, value); }),
    removeItem: jest.fn(async key => { data.delete(key); }),
  };
  const scope = new AccountScope();
  const captured = scope.capture();
  const key = memoryStorageKey('alice', 'action:moment');
  const journal = new MemoryJournal(storage, key, captured.assertCurrent);
  const send = jest.fn<Promise<unknown>, [string, string?, unknown?]>();
  const request: AccountRequest = async <T,>(path: string, method?: string, input?: unknown) => await send(path, method, input) as T;
  return { data, storage, scope, captured, key, journal, send, request };
}
test('writes durable identity before sending, then clears only after acknowledged success', async () => {
  const { journal, request, send, data, key } = setup();
  send.mockImplementation(async () => { expect(JSON.parse(data.get(key)!)).toEqual(operation); return { id: 'moment' }; });
  await expect(journal.execute(request, operation)).resolves.toEqual({ id: 'moment' });
  expect(data.size).toBe(0);
});
test('network ambiguity survives restart and replays the exact original input', async () => {
  const { journal, storage, key, captured, request, send } = setup();
  send.mockRejectedValueOnce(new ApiError('Offline')).mockResolvedValueOnce({ id: 'moment' });
  await expect(journal.execute(request, operation)).rejects.toThrow('Offline');
  const restarted = new MemoryJournal(storage, key, captured.assertCurrent);
  await expect(restarted.execute(request, { ...operation, input: { requestId: 'changed' } })).rejects.toThrow('Retry');
  await expect(restarted.execute(request)).resolves.toEqual({ id: 'moment' });
  expect(send.mock.calls).toEqual([[operation.path, operation.method, operation.input], [operation.path, operation.method, operation.input]]);
});
test.each([400, 403, 404, 409, 413, 422])('definitive status %s unlocks editing instead of endlessly replaying an invalid write', async status => {
  const { journal, request, send } = setup();
  send.mockRejectedValue(new ApiError('Rejected', status));
  await expect(journal.execute(request, operation)).rejects.toThrow('Rejected');
  expect(await journal.pending()).toBeNull();
});
test.each([0, 200, 401, 429, 500, 503])('ambiguous or retryable status %s preserves the original operation', async status => {
  const { journal, request, send } = setup();
  send.mockRejectedValue(new ApiError('Retry', status));
  await expect(journal.execute(request, operation)).rejects.toThrow();
  expect(await journal.pending()).toEqual(operation);
});
test('account switch during persistence prevents transmission and keeps data scoped to the former account', async () => {
  const { storage, journal, scope, request, send, key, data } = setup();
  jest.mocked(storage.setItem).mockImplementation(async (key, value) => { data.set(key, value); scope.change(); });
  await expect(journal.execute(request, operation)).rejects.toMatchObject({ code: 'account_changed' });
  expect(send).not.toHaveBeenCalled();
  expect(data.has(key)).toBe(true);
  const bob = new MemoryJournal(storage, memoryStorageKey('bob', 'action:moment'), scope.capture().assertCurrent);
  expect(await bob.pending()).toBeNull();
});
test('late responses after switching account cannot clear the saved original action', async () => {
  const { journal, scope, request, send, data, key } = setup();
  send.mockImplementation(async () => { scope.change(); return { id: 'old' }; });
  await expect(journal.execute(request, operation)).rejects.toMatchObject({ code: 'account_changed' });
  expect(data.has(key)).toBe(true);
});
test('storage failure prevents a request with no durable identity', async () => {
  const { storage, journal, request, send } = setup();
  jest.mocked(storage.setItem).mockRejectedValue(new Error('Disk full'));
  await expect(journal.execute(request, operation)).rejects.toThrow('Disk full');
  expect(send).not.toHaveBeenCalled();
});
test('malformed persisted methods and external paths never reach the API', async () => {
  const { data, key, journal, request, send } = setup();
  for (const invalid of [{ ...operation, path: 'https://external.test' }, { ...operation, method: 'GET' }, {}, null]) {
    data.set(key, JSON.stringify(invalid));
    await expect(journal.execute(request)).rejects.toThrow('saved action');
  }
  expect(send).not.toHaveBeenCalled();
});
