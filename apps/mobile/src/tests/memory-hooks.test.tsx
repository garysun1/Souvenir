/** @jest-environment jsdom */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountScope, ApiError } from '@/lib/api';
import { memoryStorageKey } from '@/lib/memoryJournal';
import { useMemoryActions, useMemoryDraft, useMemoryResource } from '@/lib/useMemories';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]) }));
jest.mock('@/state/AppProvider', () => ({ useApp: () => mockService }));
const read = jest.fn<Promise<unknown>, [string, string?, unknown?]>();
const request = async <T,>(path: string, method?: string, input?: unknown): Promise<T> => await read(path, method, input) as T;
let scope: AccountScope;
const mockService = { userId: 'alice', accountRequest: request, accountRevision: 0, assertAccountCurrent: (): void => undefined };
let draft: ReturnType<typeof useMemoryDraft<{ title: string }>>;
let action: ReturnType<typeof useMemoryActions>;
let resource: ReturnType<typeof useMemoryResource<{ name: string }>>;
let root: Root;
const saved = jest.fn();
function Observe({ name = 'taste' }: { name?: string }) {
  const currentDraft = useMemoryDraft(name, { title: '' });
  const currentAction = useMemoryActions(name, saved);
  const currentResource = useMemoryResource<{ name: string }>('/api/taste');
  useEffect(() => { draft = currentDraft; action = currentAction; resource = currentResource; }, [currentDraft, currentAction, currentResource]);
  return null;
}
beforeEach(async () => {
  await AsyncStorage.clear(); read.mockReset(); saved.mockReset();
  scope = new AccountScope();
  mockService.userId = 'alice'; mockService.accountRequest = request; mockService.accountRevision = 0;
  mockService.assertAccountCurrent = scope.capture().assertCurrent;
  read.mockResolvedValue({ name: 'Private profile' });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); });
test('draft edits survive unmount/remount and never initialize another account with former values', async () => {
  await act(async () => root.render(<Observe />));
  await act(async () => draft.save({ title: 'Private alice title' }));
  expect(JSON.parse((await AsyncStorage.getItem(memoryStorageKey('alice', 'draft:taste')))!)).toEqual({ title: 'Private alice title' });
  await act(async () => root.render(null));
  await act(async () => root.render(<Observe />));
  expect(draft.value.title).toBe('Private alice title');
  scope.change(); mockService.userId = 'bob'; mockService.assertAccountCurrent = scope.capture().assertCurrent;
  await act(async () => root.render(<Observe />));
  expect(draft.value.title).toBe('');
  expect(await AsyncStorage.getItem(memoryStorageKey('bob', 'draft:taste'))).toBeNull();
});
test('changing resource scope resets visible edits without waiting for a navigation remount', async () => {
  await act(async () => root.render(<Observe name="first" />));
  await act(async () => draft.save({ title: 'First moment' }));
  await act(async () => root.render(<Observe name="second" />));
  expect(draft.value.title).toBe('');
});
test('an unfinished write restores after remount and retries the original consent and target', async () => {
  await act(async () => root.render(<Observe />));
  read.mockRejectedValueOnce(new ApiError('Offline'));
  const operation = { label: 'publish', path: '/api/taste/publish', method: 'POST', input: { expectedVersion: 2, sharing: 'friends', confirmShare: true } };
  await act(async () => { await expect(action.run(operation)).rejects.toThrow('Offline'); });
  expect(action.locked).toBe(true);
  await act(async () => root.render(null));
  await act(async () => root.render(<Observe />));
  expect(action.pending).toEqual(operation);
  read.mockClear();
  await act(async () => { await action.run(); });
  expect(read).toHaveBeenCalledWith(operation.path, operation.method, operation.input);
  expect(saved).toHaveBeenCalledTimes(1); expect(action.locked).toBe(false);
});
test('refetch failure never substitutes sample profile data, and 404 revokes the cached profile', async () => {
  await act(async () => root.render(<Observe />));
  expect(resource.data?.name).toBe('Private profile');
  read.mockRejectedValueOnce(new ApiError('Not visible', 404));
  await act(async () => resource.reload());
  expect(resource.data).toBeUndefined(); expect(resource.error).toBe('Not visible');
});
test('provider foreground or explicit refresh revisions fetch changes from another client', async () => {
  await act(async () => root.render(<Observe />));
  read.mockResolvedValueOnce({ name: 'Edited on web' });
  mockService.accountRevision++;
  await act(async () => root.render(<Observe />));
  expect(resource.data?.name).toBe('Edited on web');
  expect(draft.value.title).toBe('');
});
