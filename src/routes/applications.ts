import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors.js';

export const applicationRoutes = new Hono();

applicationRoutes.post('/', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;
  const body = await c.req.json<{ apartment_id: string; message: string }>();

  if (!body.apartment_id) return badRequest(c, 'apartment_id is required');

  const { data, error } = await supabase
    .from('applications')
    .insert({
      apartment_id: body.apartment_id,
      applicant_id: userClaims!.id,
      message: body.message ?? null,
    } as never)
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

applicationRoutes.get('/mine', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;

  const { data, error } = await supabase
    .from('applications')
    .select('*, apartment:apartments(*, owner:profiles!apartments_owner_id_fkey(*))')
    .eq('applicant_id', userClaims!.id)
    .order('created_at', { ascending: false });

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

applicationRoutes.get('/owner', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;

  const { data, error } = await supabase
    .from('applications')
    .select(
      '*, apartment:apartments!inner(*), applicant:profiles!applications_applicant_id_fkey(*)'
    )
    .eq('apartment.owner_id', userClaims!.id)
    .order('created_at', { ascending: false });

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

applicationRoutes.post('/:id/approve', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase } = c.var.supabaseContext;
  const id = c.req.param('id');

  const { data, error } = await (supabase as any).rpc('approve_application', {
    p_application_id: id,
  });

  if (error) return badRequest(c, error.message);
  return ok(c, { conversation_id: data });
});

applicationRoutes.post('/:id/reject', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase } = c.var.supabaseContext;
  const id = c.req.param('id');

  const { error } = await (supabase as any).rpc('reject_application', {
    p_application_id: id,
  });

  if (error) return badRequest(c, error.message);
  return ok(c, { ok: true });
});
