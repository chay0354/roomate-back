import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors';
import { getServiceClient } from '../lib/supabase-service';

export const applicationRoutes = new Hono();

async function openChatForApplication(
  supabase: any,
  userId: string,
  apartmentId: string,
  message: string | null
): Promise<string> {
  const msg =
    message?.trim() || 'היי! נראה לי שזו דירה שמתאימה לי. אשמח לדבר 🙂';

  const { data: apt, error: aptErr } = await supabase
    .from('apartments')
    .select('id, owner_id')
    .eq('id', apartmentId)
    .single();
  if (aptErr || !apt) throw new Error(aptErr?.message ?? 'apartment not found');
  if (apt.owner_id === userId) throw new Error('cannot apply to your own apartment');

  const { data: existingApp } = await supabase
    .from('applications')
    .select('*')
    .eq('apartment_id', apartmentId)
    .eq('applicant_id', userId)
    .maybeSingle();

  let applicationId: string;
  if (existingApp) {
    applicationId = existingApp.id;
    await supabase
      .from('applications')
      .update({
        message: msg,
        updated_at: new Date().toISOString(),
        status: existingApp.status === 'rejected' ? 'pending' : existingApp.status,
      })
      .eq('id', applicationId);
  } else {
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .insert({
        apartment_id: apartmentId,
        applicant_id: userId,
        message: msg,
        status: 'pending',
      })
      .select('id')
      .single();
    if (appErr || !app) throw new Error(appErr?.message ?? 'failed to create application');
    applicationId = app.id;
  }

  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('application_id', applicationId)
    .maybeSingle();

  let conversationId = existingConv?.id as string | undefined;

  if (!conversationId) {
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({ apartment_id: apartmentId, application_id: applicationId })
      .select('id')
      .single();
    if (convErr || !conv) throw new Error(convErr?.message ?? 'failed to create conversation');
    conversationId = conv.id;
  }

  // Always add the applicant first (RLS always allows inserting yourself).
  // Then try to add the owner (needs policy/RPC/service role).
  const addMember = async (memberId: string, required: boolean) => {
    const { error: memErr } = await supabase.from('conversation_members').insert({
      conversation_id: conversationId,
      user_id: memberId,
    });
    if (!memErr) return;
    const msgLower = String(memErr.message).toLowerCase();
    if (msgLower.includes('duplicate') || msgLower.includes('unique')) return;
    if (required) throw new Error(memErr.message);
  };

  await addMember(userId, true);
  await addMember(apt.owner_id as string, false);

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (!count) {
    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userId,
      body: msg,
    });
    if (msgErr) throw new Error(msgErr.message);
  }

  // Best-effort notify owner (may fail under strict RLS)
  await supabase.from('notifications').insert({
    user_id: apt.owner_id,
    type: 'application_received',
    title: 'פנייה חדשה לדירה',
    body: 'מישהו שלח פנייה ופתח צ׳אט',
    data: {
      application_id: applicationId,
      conversation_id: conversationId,
      apartment_id: apartmentId,
    },
  });

  return conversationId!;
}

applicationRoutes.post('/', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = c.var.supabaseContext;
  const body = await c.req.json<{ apartment_id: string; message?: string }>();
  const userId = userClaims!.id;

  if (!body.apartment_id) return badRequest(c, 'apartment_id is required');

  // Prefer atomic RPC when migration is applied
  const { data: rpcId, error: rpcErr } = await (supabase as any).rpc('apply_and_open_chat', {
    p_apartment_id: body.apartment_id,
    p_message: body.message ?? null,
  });

  if (!rpcErr && rpcId) {
    return ok(c, { conversation_id: rpcId as string });
  }

  // Fallback path (works even if RPC not applied yet): create conversation + membership
  const service = getServiceClient();
  const client = service ?? supabase;

  try {
    const conversationId = await openChatForApplication(
      client,
      userId,
      body.apartment_id,
      body.message ?? null
    );
    return ok(c, { conversation_id: conversationId });
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'failed to open chat';
    return badRequest(c, detail);
  }
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
