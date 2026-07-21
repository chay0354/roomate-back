import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors.js';
import { getSupabaseContext } from '../lib/hono-context.js';

export const conversationRoutes = new Hono();

conversationRoutes.use('*', withSupabase({ auth: 'user' }));

conversationRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims!.id;

  const { data: memberRows, error: memberErr } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId);

  if (memberErr) return badRequest(c, memberErr.message);

  const convIds = (memberRows ?? []).map((r) => r.conversation_id as string);
  if (convIds.length === 0) return ok(c, []);

  const { data, error } = await supabase
    .from('conversations')
    .select('*, apartment:apartments(*), conversation_members(user_id, profile:profiles(*))')
    .in('id', convIds)
    .order('created_at', { ascending: false });

  if (error) return badRequest(c, error.message);

  const conversations = data ?? [];

  const results = await Promise.all(
    conversations.map(async (conv: any) => {
      const otherMember = conv.conversation_members?.find(
        (m: { user_id: string }) => m.user_id !== userId
      );

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...conv,
        other_member: otherMember?.profile ?? null,
        last_message: lastMsg ?? null,
      };
    })
  );

  results.sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.created_at;
    const bTime = b.last_message?.created_at ?? b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return ok(c, results);
});

conversationRoutes.get('/:id/messages', async (c) => {
  const { supabase } = getSupabaseContext(c);
  const conversationId = c.req.param('id');

  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles(*)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

conversationRoutes.post('/:id/messages', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const conversationId = c.req.param('id');
  const body = await c.req.json<{ body: string }>();

  if (!body.body?.trim()) return badRequest(c, 'Message body is required');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: userClaims!.id,
      body: body.body.trim(),
    } as never)
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
