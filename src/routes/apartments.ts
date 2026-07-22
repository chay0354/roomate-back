import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, notFound, ok } from '../lib/errors';
import { getSupabaseContext } from '../lib/hono-context';
import { getAnonClient } from '../lib/supabase-anon';

export const apartmentRoutes = new Hono();

const apartmentSelect = '*, owner:profiles!apartments_owner_id_fkey(*)';

apartmentRoutes.get('/', async (c) => {
  const neighborhood = c.req.query('neighborhood');
  const search = c.req.query('search');
  const supabase = getAnonClient();

  let query = supabase
    .from('apartments')
    .select(apartmentSelect)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (neighborhood) query = query.eq('neighborhood', neighborhood);
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,address.ilike.%${search}%,neighborhood.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

/** Apartments owned by the current user (for apartment-tour reels, etc.). */
apartmentRoutes.get('/mine', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const { data, error } = await supabase
    .from('apartments')
    .select(apartmentSelect)
    .eq('owner_id', userClaims!.id)
    .order('created_at', { ascending: false });

  if (error) return badRequest(c, error.message);
  return ok(c, data ?? []);
});

apartmentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = getAnonClient();

  const { data, error } = await supabase
    .from('apartments')
    .select(apartmentSelect)
    .eq('id', id)
    .single();

  if (error) return notFound(c, error.message);
  return ok(c, data);
});

apartmentRoutes.post('/', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;
  const body = await c.req.json<Record<string, unknown>>();

  const payload: Record<string, unknown> = {
    ...body,
    owner_id: userClaims!.id,
  };
  delete payload.id;

  const { data, error } = await supabase
    .from('apartments')
    .insert(payload as never)
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
