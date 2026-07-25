import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors';
import { getSupabaseContext } from '../lib/hono-context';

export const publicProfileRoutes = new Hono();

publicProfileRoutes.use('*', withSupabase({ auth: 'user' }));

/** Public profile + friendship status relative to the current user. */
publicProfileRoutes.get('/:id', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;
  const id = c.req.param('id');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return badRequest(c, error.message);

  if (id === me) {
    return ok(c, { profile, friendship_status: 'self' });
  }

  const { data: row, error: fErr } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${me})`
    )
    .maybeSingle();

  if (fErr) return badRequest(c, fErr.message);

  let friendship_status: 'none' | 'pending_out' | 'pending_in' | 'friends' | 'declined' =
    'none';
  if (row?.status === 'accepted') friendship_status = 'friends';
  else if (row?.status === 'declined') friendship_status = 'declined';
  else if (row?.status === 'pending') {
    friendship_status = row.requester_id === me ? 'pending_out' : 'pending_in';
  }

  return ok(c, { profile, friendship_status });
});
