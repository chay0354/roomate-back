import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors';
import { getSupabaseContext } from '../lib/hono-context';

export const profileRoutes = new Hono();

profileRoutes.use('*', withSupabase({ auth: 'user' }));

profileRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userClaims!.id)
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

profileRoutes.patch('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const patch = await c.req.json<Record<string, unknown>>();

  delete patch.id;
  delete patch.created_at;
  delete patch.updated_at;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userClaims!.id)
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
