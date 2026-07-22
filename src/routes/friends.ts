import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors';
import { getSupabaseContext } from '../lib/hono-context';

export const friendRoutes = new Hono();

friendRoutes.use('*', withSupabase({ auth: 'user' }));

/** Accepted friends for the current user. */
friendRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;

  const { data, error } = await supabase
    .from('friendships')
    .select(
      'requester_id, addressee_id, status, created_at, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)'
    )
    .eq('status', 'accepted')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);

  if (error) return badRequest(c, error.message);

  const friends = (data ?? []).map((row: any) => {
    const profile = row.requester_id === me ? row.addressee : row.requester;
    return {
      friendship: { requester_id: row.requester_id, addressee_id: row.addressee_id, status: row.status },
      profile,
    };
  });

  return ok(c, friends);
});

/** People you are not friends with yet (suggestions). */
friendRoutes.get('/suggestions', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;

  const { data: existing, error: e1 } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);

  if (e1) return badRequest(c, e1.message);

  const exclude = new Set<string>([me]);
  for (const row of existing ?? []) {
    exclude.add(row.requester_id);
    exclude.add(row.addressee_id);
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', me)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) return badRequest(c, error.message);

  const suggestions = (profiles ?? []).filter((p: { id: string }) => !exclude.has(p.id));
  return ok(c, suggestions);
});

/** Apartments owned by accepted friends. */
friendRoutes.get('/apartments', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;

  const { data: friendships, error: e1 } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);

  if (e1) return badRequest(c, e1.message);

  const friendIds = (friendships ?? []).map((row: any) =>
    row.requester_id === me ? row.addressee_id : row.requester_id
  );

  if (!friendIds.length) return ok(c, []);

  const { data, error } = await supabase
    .from('apartments')
    .select('*, owner:profiles!apartments_owner_id_fkey(*)')
    .in('owner_id', friendIds)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) return badRequest(c, error.message);
  return ok(c, data ?? []);
});

friendRoutes.post('/request', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const body = await c.req.json<{ user_id: string }>();
  if (!body.user_id) return badRequest(c, 'user_id is required');
  if (body.user_id === userClaims!.id) return badRequest(c, 'cannot friend yourself');

  const { data, error } = await supabase
    .from('friendships')
    .insert({
      requester_id: userClaims!.id,
      addressee_id: body.user_id,
      status: 'accepted',
    })
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
