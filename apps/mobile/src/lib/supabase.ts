import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './env';

let client: SupabaseClient | undefined;
export function getSupabase() {
  if (!client) {
    const config = getConfig();
    client = createClient(config.supabaseUrl, config.publishableKey, {
      auth: { storage: AsyncStorage, storageKey: 'souvenir-auth-v1', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
  }
  return client;
}
