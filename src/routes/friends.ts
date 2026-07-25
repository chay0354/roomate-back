import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors';
import { getSupabaseContext } from '../lib/hono-context';

export const friendRoutes = new Hono();

friendRoutes.use('*', withSupabase({ auth: 'user' }));

const friendshipSelect =
  'requester_id, addressee_id, status, created_at, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)';

async function findPair(supabase: any, me: string, other: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    requester_id: string;
    addressee_id: string;
    status: string;
  } | null;
}

function friendshipStatus(
  me: string,
  row: { requester_id: string; addressee_id: string; status: string } | null
): 'none' | 'pending_out' | 'pending_in' | 'friends' | 'declined' {
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  if (row.status === 'declined') return 'declined';
  if (row.status === 'pending') {
    return row.requester_id === me ? 'pending_out' : 'pending_in';
  }
  return 'none';
}

/** Accepted friends for the current user. */
friendRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;

  const { data, error } = await supabase
    .from('friendships')
    .select(friendshipSelect)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);

  if (error) return badRequest(c, error.message);

  const friends = (data ?? []).map((row: any) => {
    const profile = row.requester_id === me ? row.addressee : row.requester;
    return {
      friendship: {
        requester_id: row.requester_id,
        addressee_id: row.addressee_id,
        status: row.status,
      },
      profile,
    };
  });

  return ok(c, friends);
});

/** Incoming pending friend requests (I am the addressee). */
friendRoutes.get('/pending', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;

  const { data, error } = await supabase
    .from('friendships')
    .select(friendshipSelect)
    .eq('status', 'pending')
    .eq('addressee_id', me)
    .order('created_at', { ascending: false });

  if (error) return badRequest(c, error.message);

  const pending = (data ?? []).map((row: any) => ({
    friendship: {
      requester_id: row.requester_id,
      addressee_id: row.addressee_id,
      status: row.status,
    },
    profile: row.requester,
  }));

  return ok(c, pending);
});

/** Friendship status with another user. */
friendRoutes.get('/status/:userId', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;
  const other = c.req.param('userId');
  if (!other) return badRequest(c, 'userId is required');
  if (other === me) return ok(c, { status: 'self' });

  try {
    const row = await findPair(supabase, me, other);
    return ok(c, { status: friendshipStatus(me, row) });
  } catch (e) {
    return badRequest(c, e instanceof Error ? e.message : 'status failed');
  }
});

/** People you are not friends with yet (suggestions). */
friendRoutes.get('/suggestions', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;

  const { data: existing, error: e1 } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);

  if (e1) return badRequest(c, e1.message);

  const exclude = new Set<string>([me]);
  for (const row of existing ?? []) {
    // Hide accepted + pending (either direction). Allow suggesting after declined.
    if (row.status === 'accepted' || row.status === 'pending') {
      exclude.add(row.requester_id);
      exclude.add(row.addressee_id);
    }
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

/** Send a friend request (pending until the other user accepts). */
friendRoutes.post('/request', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;
  const body = await c.req.json<{ user_id: string }>();
  if (!body.user_id) return badRequest(c, 'user_id is required');
  if (body.user_id === me) return badRequest(c, 'cannot friend yourself');

  try {
    const existing = await findPair(supabase, me, body.user_id);

    if (existing?.status === 'accepted') {
      return badRequest(c, 'כבר חברים');
    }

    if (existing?.status === 'pending') {
      if (existing.requester_id === me) {
        return badRequest(c, 'בקשת חברות כבר נשלחה');
      }
      // They already asked me — accept instead
      const { data, error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('requester_id', existing.requester_id)
        .eq('addressee_id', existing.addressee_id)
        .select('*')
        .single();
      if (error) return badRequest(c, error.message);
      return ok(c, data);
    }

    if (existing?.status === 'declined') {
      if (existing.requester_id === me) {
        const { data, error } = await supabase
          .from('friendships')
          .update({ status: 'pending' })
          .eq('requester_id', me)
          .eq('addressee_id', body.user_id)
          .select('*')
          .single();
        if (error) return badRequest(c, error.message);
        return ok(c, data);
      }
      const { error: delErr } = await supabase
        .from('friendships')
        .delete()
        .eq('requester_id', existing.requester_id)
        .eq('addressee_id', existing.addressee_id);
      if (delErr) {
        // Can't swap roles without delete — reopen as pending for them to accept again
        const { data, error } = await supabase
          .from('friendships')
          .update({ status: 'pending' })
          .eq('requester_id', existing.requester_id)
          .eq('addressee_id', existing.addressee_id)
          .select('*')
          .single();
        if (error) return badRequest(c, error.message);
        return ok(c, data);
      }
    }

    const { data, error } = await supabase
      .from('friendships')
      .insert({
        requester_id: me,
        addressee_id: body.user_id,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error) return badRequest(c, error.message);
    return ok(c, data);
  } catch (e) {
    return badRequest(c, e instanceof Error ? e.message : 'request failed');
  }
});

/** Accept or decline an incoming friend request. */
friendRoutes.post('/respond', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const me = userClaims!.id;
  const body = await c.req.json<{ user_id: string; action: 'accept' | 'decline' }>();

  if (!body.user_id) return badRequest(c, 'user_id is required');
  if (body.action !== 'accept' && body.action !== 'decline') {
    return badRequest(c, 'action must be accept or decline');
  }

  const { data: row, error: findErr } = await supabase
    .from('friendships')
    .select('*')
    .eq('requester_id', body.user_id)
    .eq('addressee_id', me)
    .eq('status', 'pending')
    .maybeSingle();

  if (findErr) return badRequest(c, findErr.message);
  if (!row) return badRequest(c, 'לא נמצאה בקשת חברות ממתינה');

  if (body.action === 'decline') {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('requester_id', body.user_id)
      .eq('addressee_id', me);
    if (error) {
      // Fallback if delete policy is missing: mark declined
      const { data, error: uErr } = await supabase
        .from('friendships')
        .update({ status: 'declined' })
        .eq('requester_id', body.user_id)
        .eq('addressee_id', me)
        .select('*')
        .single();
      if (uErr) return badRequest(c, uErr.message);
      return ok(c, data);
    }
    return ok(c, { ok: true, status: 'declined' });
  }

  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester_id', body.user_id)
    .eq('addressee_id', me)
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
