interface TokenSession { access_token: string; user: { id: string } }
interface SessionResult { data: { session: TokenSession | null }; error: Error | null }
export interface TokenProvider {
  getSession(): Promise<SessionResult>;
  refreshSession(): Promise<SessionResult>;
}
export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = 'network_error', public details?: unknown) { super(message); }
}
export class AccountScope {
  private controller = new AbortController();
  private generation = 0;
  change() { this.controller.abort(); this.controller = new AbortController(); this.generation++; }
  capture() {
    const generation = this.generation;
    return { signal: this.controller.signal, assertCurrent: () => {
      if (generation !== this.generation) throw new ApiError('The account changed. Please try again.', 401, 'account_changed');
    } };
  }
}
export class AccountApi {
  constructor(
    private origin: string,
    private tokens: TokenProvider,
    readonly userId: string,
    private scope: ReturnType<AccountScope['capture']>,
    private send: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}
  assertCurrent() { this.scope.assertCurrent(); }
  async request<T>(path: string, method = 'GET', input?: unknown): Promise<T> {
    return (await this.page<T>(path, method, input)).data;
  }
  async page<T>(path: string, method = 'GET', input?: unknown): Promise<{ data: T; nextCursor?: string | null }> {
    const body = input === undefined ? undefined : JSON.stringify(input);
    for (let attempt = 0; attempt < 2; attempt++) {
      this.assertCurrent();
      let result: SessionResult;
      try { result = attempt ? await this.tokens.refreshSession() : await this.tokens.getSession(); }
      catch {
        this.assertCurrent();
        throw new ApiError('Your session could not be refreshed. Check your connection or sign in again.', 401, 'unauthorized');
      }
      this.assertCurrent();
      if (result.error || !result.data.session || result.data.session.user.id !== this.userId) {
        throw new ApiError('Your session expired. Sign in again to continue.', 401, 'unauthorized');
      }
      let response: Response;
      try {
        response = await this.send(`${this.origin}${path}`, {
          method, body, headers: { Authorization: `Bearer ${result.data.session.access_token}`, 'Content-Type': 'application/json' },
          credentials: 'omit', cache: 'no-store', signal: this.scope.signal,
        });
      } catch {
        this.assertCurrent();
        throw new ApiError('Could not reach Souvenir. Check your connection and retry; your draft is preserved.');
      }
      this.assertCurrent();
      if (response.status === 401 && attempt === 0) continue;
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new ApiError('The server returned an unreadable response. Retry shortly.', response.status); }
      this.assertCurrent();
      if (!response.ok || !payload || typeof payload !== 'object' || !('data' in payload) || 'error' in payload) {
        const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : 'The request failed. Please retry.';
        const code = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'invalid_response';
        const details = payload && typeof payload === 'object' && 'details' in payload ? payload.details : undefined;
        throw new ApiError(response.status === 401 ? 'Your session expired. Sign in again to continue.' : message, response.status, code, details);
      }
      return { data: payload.data as T, nextCursor: 'nextCursor' in payload && typeof payload.nextCursor === 'string' ? payload.nextCursor : null };
    }
    throw new ApiError('Sign in again to continue.', 401, 'unauthorized');
  }
}
