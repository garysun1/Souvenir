import { ApiError } from './api';
import type { AccountRequest } from './worldwide';

export interface MemoryOperation { label: string; path: string; method: string; input: unknown }
export interface JournalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}
export const memoryStorageKey = (userId: string, scope: string) => `souvenir-memories-v1:${userId}:${scope}`;

export class MemoryJournal {
  private busy = false;
  constructor(private storage: JournalStorage, private key: string, private assertCurrent: () => void) {}
  async pending(): Promise<MemoryOperation | null> {
    this.assertCurrent();
    const raw = await this.storage.getItem(this.key);
    this.assertCurrent();
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('label' in value) || typeof value.label !== 'string' ||
      !('path' in value) || typeof value.path !== 'string' || !value.path.startsWith('/api/') ||
      !('method' in value) || typeof value.method !== 'string' || !['POST', 'PATCH', 'DELETE'].includes(value.method) || !('input' in value)) {
      throw new Error('The saved action could not be read. Local storage needs recovery.');
    }
    return { label: value.label, path: value.path, method: value.method, input: value.input };
  }
  async execute<T>(request: AccountRequest, next?: MemoryOperation): Promise<T> {
    if (this.busy) throw new Error('An action is already in progress.');
    this.busy = true;
    let sent = false;
    try {
      const previous = await this.pending();
      if (previous && next) throw new Error(`Retry “${previous.label}” before starting another action.`);
      const operation = previous ?? next;
      if (!operation) throw new Error('There is no unfinished action.');
      this.assertCurrent();
      await this.storage.setItem(this.key, JSON.stringify(operation));
      this.assertCurrent();
      sent = true;
      const result = await request<T>(operation.path, operation.method, operation.input);
      this.assertCurrent();
      await this.storage.removeItem(this.key);
      this.assertCurrent();
      return result;
    } catch (reason) {
      this.assertCurrent();
      if (sent && reason instanceof ApiError && [400, 403, 404, 409, 413, 422].includes(reason.status)) {
        await this.storage.removeItem(this.key);
        this.assertCurrent();
      }
      throw reason;
    } finally { this.busy = false; }
  }
}
