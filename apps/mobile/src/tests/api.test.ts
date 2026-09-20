import { AccountApi, AccountScope, ApiError, type TokenProvider } from '@/lib/api';

const userId = '1f413e17-58f5-4528-883b-0b2141c93a37';
const session = (token: string, id = userId) => ({ data: { session: { access_token: token, user: { id } } }, error: null });
function response(status: number, payload: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => payload } as Response;
}
function setup() {
  const tokens: jest.Mocked<TokenProvider> = { getSession: jest.fn().mockResolvedValue(session('first')), refreshSession: jest.fn().mockResolvedValue(session('refreshed')) };
  const send = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const scope = new AccountScope();
  return { tokens, send, scope, api: new AccountApi('https://souvenir.test', tokens, userId, scope.capture(), send) };
}
test.each([200, 401])('default fetch uses its global receiver, including refresh (status=%p)', async firstStatus => {
  const { tokens, scope } = setup();
  let calls = 0;
  const nativeFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(function (this: typeof globalThis) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(response(calls++ === 0 ? firstStatus : 200, { data: { id: 'shared' } }));
  });
  try {
    const api = new AccountApi('https://souvenir.test', tokens, userId, scope.capture());
    await expect(api.request('/api/bootstrap')).resolves.toEqual({ id: 'shared' });
    expect(nativeFetch).toHaveBeenCalledTimes(firstStatus === 401 ? 2 : 1);
    expect(tokens.refreshSession).toHaveBeenCalledTimes(firstStatus === 401 ? 1 : 0);
    expect(nativeFetch).toHaveBeenLastCalledWith('https://souvenir.test/api/bootstrap', expect.objectContaining({
      credentials: 'omit',
      headers: expect.objectContaining({ Authorization: `Bearer ${firstStatus === 401 ? 'refreshed' : 'first'}` }),
    }));
  } finally {
    nativeFetch.mockRestore();
  }
});
test('bearer refresh retries once with unchanged request ID and body, without cookies', async () => {
  const { api, send, tokens } = setup();
  send.mockResolvedValueOnce(response(401, { error: 'unauthorized' })).mockResolvedValueOnce(response(201, { data: { id: 'saved' } }));
  const input = { requestId: 'dc873269-f812-4fe4-a6e1-b50a87d3d288', note: 'A visit' };
  await expect(api.request('/api/editions', 'POST', input)).resolves.toEqual({ id: 'saved' });
  expect(tokens.refreshSession).toHaveBeenCalledTimes(1);
  expect(send.mock.calls.map(([, init]) => init?.body)).toEqual([JSON.stringify(input), JSON.stringify(input)]);
  expect(send.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer first' } });
  expect(send.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer refreshed' });
});
test('a second 401 is an actionable failure, never a fixture fallback', async () => {
  const { api, send, tokens } = setup();
  send.mockResolvedValue(response(401, { error: 'unauthorized' }));
  await expect(api.request('/api/bootstrap')).rejects.toMatchObject({ status: 401, message: expect.stringContaining('Sign in') });
  expect(send).toHaveBeenCalledTimes(2);
  expect(tokens.refreshSession).toHaveBeenCalledTimes(1);
});
test.each([null, 'not an envelope', 42, [], { error: 'conflict', message: 'Request already used' }, { data: {}, error: 'conflict' }])('rejects malformed or error success payload: %p', async payload => {
  const { api, send } = setup();
  send.mockResolvedValue(response(200, payload));
  await expect(api.request('/api/bootstrap')).rejects.toBeInstanceOf(ApiError);
});
test('non-2xx data is never a successful write', async () => {
  const { api, send } = setup();
  send.mockResolvedValue(response(503, { data: { saved: true } }));
  await expect(api.request('/api/editions', 'POST', {})).rejects.toMatchObject({ status: 503 });
});
test('network and unreadable JSON errors preserve actionable failures', async () => {
  const { api, send } = setup();
  send.mockRejectedValueOnce(new TypeError('offline'));
  await expect(api.request('/api/editions', 'POST', {})).rejects.toThrow('draft is preserved');
  send.mockResolvedValueOnce({ ...response(200, null), json: async () => { throw new Error('html'); } });
  await expect(api.request('/api/bootstrap')).rejects.toThrow('unreadable');
});
test('sign-out aborts old work and discards even an uncancellable late response', async () => {
  const { api, send, scope } = setup();
  let finish: (response: Response) => void = () => { throw new Error('Fetch not started'); };
  send.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const result = api.request('/api/bootstrap');
  await Promise.resolve();
  const signal = send.mock.calls[0][1]?.signal;
  scope.change();
  expect(signal?.aborted).toBe(true);
  finish(response(200, { data: { private: 'old account' } }));
  await expect(result).rejects.toMatchObject({ code: 'account_changed' });
  await expect(api.request('/api/bootstrap')).rejects.toMatchObject({ code: 'account_changed' });
  expect(send).toHaveBeenCalledTimes(1);
});
test('new SDK user cannot receive an old account request', async () => {
  const { api, tokens, send } = setup();
  tokens.getSession.mockResolvedValue(session('other', 'another-user'));
  await expect(api.request('/api/bootstrap')).rejects.toMatchObject({ code: 'unauthorized' });
  expect(send).not.toHaveBeenCalled();
});
test('switch during token refresh prevents a retried write', async () => {
  const { api, tokens, send, scope } = setup();
  send.mockResolvedValue(response(401, { error: 'unauthorized' }));
  tokens.refreshSession.mockImplementation(async () => { scope.change(); return session('other'); });
  await expect(api.request('/api/editions', 'POST', { requestId: 'same' })).rejects.toMatchObject({ code: 'account_changed' });
  expect(send).toHaveBeenCalledTimes(1);
});
test.each([false, true])('SDK exceptions become actionable auth errors (refresh=%p)', async refresh => {
  const { api, tokens, send } = setup();
  if (refresh) {
    send.mockResolvedValue(response(401, { error: 'unauthorized' }));
    tokens.refreshSession.mockRejectedValue(new Error('SDK transport failure'));
  } else tokens.getSession.mockRejectedValue(new Error('SDK transport failure'));
  await expect(api.request('/api/bootstrap')).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
  expect(send).toHaveBeenCalledTimes(refresh ? 1 : 0);
});
