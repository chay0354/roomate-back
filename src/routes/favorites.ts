import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors.js';
import { getSupabaseContext } from '../lib/hono-context.js';

export const favoriteRoutes = new Hono();

favoriteRoutes.use('*', withSupabase({ auth: 'user' }));

favoriteRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);

  const { data, error } = await supabase
    .from('favorites')
    .select('*, apartment:apartments(*, owner:profiles!apartments_owner_id_fkey(*))')
    .eq('user_id', userClaims!.id)
    .order('created_at', { ascending: false });

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

favoriteRoutes.get('/ids', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);

  const { data, error } = await supabase
    .from('favorites')
    .select('apartment_id')
    .eq('user_id', userClaims!.id);

  if (error) return badRequest(c, error.message);
  const ids = (data ?? []).map((row) => row.apartment_id as string);
  return ok(c, ids);
});

favoriteRoutes.post('/:apartmentId', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const apartmentId = c.req.param('apartmentId');
  const body = await c.req.json<{ is_favorite: boolean }>();

  if (body.is_favorite) {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userClaims!.id)
      .eq('apartment_id', apartmentId);
    if (error) return badRequest(c, error.message);
  } else {
    const { error } = await supabase.from('favorites').insert({
      user_id: userClaims!.id,
      apartment_id: apartmentId,
    } as never);
    if (error) return badRequest(c, error.message);
  }

  return ok(c, { ok: true });
});
