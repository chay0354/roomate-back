import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let anonClient: SupabaseClient | null = null;

export function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
    }
    anonClient = createClient(url, key);
  }
  return anonClient;
}
