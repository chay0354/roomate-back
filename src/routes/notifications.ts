import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors.js';
import { getSupabaseContext } from '../lib/hono-context.js';

export const notificationRoutes = new Hono();

notificationRoutes.use('*', withSupabase({ auth: 'user' }));

notificationRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userClaims!.id)
    .order('created_at', { ascending: false });

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

notificationRoutes.patch('/:id/read', async (c) => {
  const { supabase } = getSupabaseContext(c);
  const id = c.req.param('id');

  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) return badRequest(c, error.message);
  return ok(c, { ok: true });
});

notificationRoutes.post('/read-all', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userClaims!.id)
    .eq('read', false);

  if (error) return badRequest(c, error.message);
  return ok(c, { ok: true });
});
