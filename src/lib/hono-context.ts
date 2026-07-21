import type { Context } from 'hono';

export interface SupabaseRouteContext {
  supabase: any;
  userClaims: { id: string };
}

export function getSupabaseContext(c: Context): SupabaseRouteContext {
  return (c.var as { supabaseContext: SupabaseRouteContext }).supabaseContext;
}
