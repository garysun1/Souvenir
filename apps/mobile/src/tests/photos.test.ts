import { AccountApi, AccountScope } from '@/lib/api';
import { photoType, uploadPhoto } from '@/lib/photos';
import { getSupabase } from '@/lib/supabase';
import { readPhotoBytes } from '@/platform/photoBytes';

jest.mock('@/platform/photoBytes', () => ({ readPhotoBytes: jest.fn() }));
jest.mock('@/lib/supabase', () => {
  const uploadToSignedUrl = jest.fn(async () => ({ error: null }));
  return { getSupabase: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }) };
});
const userId = '1f413e17-58f5-4528-883b-0b2141c93a37';
const requestId = 'dc873269-f812-4fe4-a6e1-b50a87d3d288';
const path = `${userId}/${requestId}.jpg`;
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
const upload = jest.mocked(getSupabase().storage.from('captures').uploadToSignedUrl);
function setup(payload: unknown) {
  const scope = new AccountScope();
  const tokens = { getSession: async () => ({ data: { session: { access_token: 'test', user: { id: userId } } }, error: null }), refreshSession: async () => ({ data: { session: null }, error: null }) };
  const send = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: payload }) } as Response);
  jest.mocked(readPhotoBytes).mockResolvedValue(bytes);
  return { api: new AccountApi('https://app.test', tokens, userId, scope.capture(), send), send, scope };
}
beforeEach(() => jest.clearAllMocks());
test('uploads native binary using a server-scoped signed token and persists only a path', async () => {
  const { api, send } = setup({ bucket: 'captures', path, uploaded: false, token: 'single-object-token', signedUrl: 'https://storage.test/upload' });
  await expect(uploadPhoto(api, requestId, 'media:device.jpg')).resolves.toBe(path);
  expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toEqual({ requestId, contentType: 'image/jpeg', size: 4 });
  expect(upload).toHaveBeenCalledWith(path, 'single-object-token', bytes, { contentType: 'image/jpeg' });
});
test('uploaded:true retry skips storage upload', async () => {
  const { api } = setup({ bucket: 'captures', path, uploaded: true, token: null, signedUrl: null });
  await expect(uploadPhoto(api, requestId, 'media:device.jpg')).resolves.toBe(path);
  expect(upload).not.toHaveBeenCalled();
});
test.each([`other/${requestId}.jpg`, `${path}/../other`, `${userId}/${requestId}.png`])('rejects a mismatched server path %s', async wrongPath => {
  const { api } = setup({ bucket: 'captures', path: wrongPath, uploaded: true, token: null, signedUrl: null });
  await expect(uploadPhoto(api, requestId, 'media:device.jpg')).rejects.toThrow('destination');
  expect(upload).not.toHaveBeenCalled();
});
test('empty, oversized and unsupported image bytes never upload', () => {
  expect(() => photoType(new ArrayBuffer(0))).toThrow('10 MiB');
  expect(() => photoType(new ArrayBuffer(10 * 1024 * 1024 + 1))).toThrow('10 MiB');
  expect(() => photoType(new Uint8Array([1, 2, 3]).buffer)).toThrow('unsupported');
});
test('an account change while reading media prevents upload', async () => {
  const { api, send, scope } = setup({});
  jest.mocked(readPhotoBytes).mockImplementation(async () => { scope.change(); return bytes; });
  await expect(uploadPhoto(api, requestId, 'media:device.jpg')).rejects.toMatchObject({ code: 'account_changed' });
  expect(send).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});
