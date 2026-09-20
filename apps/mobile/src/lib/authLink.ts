import * as Linking from 'expo-linking';

export interface AuthCallback {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export function confirmationRedirect(): string {
  return Linking.createURL('/auth/confirm');
}

function parameters(url: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const section of url.split(/[?#]/).slice(1)) {
    for (const pair of section.split('&')) {
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const key = decodeURIComponent(pair.slice(0, separator));
      if (!found.has(key)) {
        found.set(key, decodeURIComponent(pair.slice(separator + 1).replace(/\+/g, ' ')));
      }
    }
  }
  return found;
}

export function parseAuthCallback(url: string): AuthCallback | null {
  const found = parameters(url);
  const read = (key: string) => found.get(key) ?? undefined;
  const failure = read('error_description') ?? read('error');
  if (failure) return { error: failure };
  const code = read('code');
  if (code) return { code };
  const accessToken = read('access_token');
  const refreshToken = read('refresh_token');
  if (accessToken && refreshToken) return { accessToken, refreshToken };
  return null;
}
