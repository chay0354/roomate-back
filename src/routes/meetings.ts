import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors.js';
import { getSupabaseContext } from '../lib/hono-context.js';

export const meetingRoutes = new Hono();

meetingRoutes.use('*', withSupabase({ auth: 'user' }));

meetingRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims!.id;

  const { data, error } = await supabase
    .from('meetings')
    .select(
      '*, apartment:apartments(*), organizer:profiles!meetings_organizer_id_fkey(*), with_user:profiles!meetings_with_user_id_fkey(*)'
    )
    .or(`organizer_id.eq.${userId},with_user_id.eq.${userId}`)
    .order('starts_at', { ascending: true });

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

meetingRoutes.post('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const body = await c.req.json<{
    apartment_id: string;
    with_user_id: string;
    starts_at: string;
    notes?: string;
  }>();

  const { data, error } = await supabase
    .from('meetings')
    .insert({
      apartment_id: body.apartment_id,
      organizer_id: userClaims!.id,
      with_user_id: body.with_user_id,
      starts_at: body.starts_at,
      notes: body.notes ?? null,
    } as never)
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
