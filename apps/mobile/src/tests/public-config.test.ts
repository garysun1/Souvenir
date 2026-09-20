import { validateConfig } from '@/lib/env';

const jwt = (role: string) =>
  [JSON.stringify({ alg: 'HS256', typ: 'JWT' }), JSON.stringify({ role })]
    .map(value => Buffer.from(value).toString('base64url'))
    .concat('test-signature')
    .join('.');

test('mobile permits local anon JWT configuration without admitting server credentials', () => {
  for (const supabaseUrl of ['http://127.0.0.1:54321', 'http://10.0.2.2:54321']) {
    const config = { supabaseUrl, apiUrl: 'http://localhost:3000', publishableKey: jwt('anon') };
    expect(validateConfig(config)).toEqual(config);
    expect(() => validateConfig({ ...config, publishableKey: jwt('service_role') })).toThrow();
    expect(() => validateConfig({ ...config, publishableKey: 'sb_secret_test' })).toThrow();
  }
});

test('hosted mobile configuration requires a publishable key and an HTTPS origin', () => {
  const config = { supabaseUrl: 'https://project.supabase.co', apiUrl: 'https://app.example', publishableKey: 'sb_publishable_test' };
  expect(validateConfig(config)).toEqual(config);
  expect(() => validateConfig({ ...config, publishableKey: jwt('anon') })).toThrow();
  expect(() => validateConfig({ ...config, supabaseUrl: 'http://localhost.attacker.test', publishableKey: jwt('anon') })).toThrow();
});
