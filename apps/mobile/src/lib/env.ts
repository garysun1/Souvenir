import { isLocalSupabaseUrl, isPublicSupabaseKey } from '../../../../shared/public-supabase-config';

export interface MobileConfig { supabaseUrl: string; publishableKey: string; apiUrl: string }

export function validateConfig(input: Partial<MobileConfig>): MobileConfig {
  if (!input.supabaseUrl || !input.publishableKey || !input.apiUrl) {
    throw new Error('Account mode needs EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY and EXPO_PUBLIC_API_URL. Demo mode is available separately.');
  }
  if (!isPublicSupabaseKey(input.publishableKey, input.supabaseUrl)) {
    throw new Error('Use a Supabase publishable key for mobile. Server credentials must never be included.');
  }
  for (const [label, value] of [['Supabase', input.supabaseUrl], ['API', input.apiUrl]]) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && (label === 'API' || isLocalSupabaseUrl(value))))) {
      throw new Error(`${label} URL must be an origin without credentials or query parameters.`);
    }
    if (url.pathname !== '/') throw new Error(`${label} URL must be an origin without a path.`);
  }
  return { supabaseUrl: input.supabaseUrl.replace(/\/$/, ''), publishableKey: input.publishableKey, apiUrl: input.apiUrl.replace(/\/$/, '') };
}

export function getConfig(): MobileConfig {
  return validateConfig({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  });
}
