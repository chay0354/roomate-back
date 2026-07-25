import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors';
import { getSupabaseContext } from '../lib/hono-context';

export const meetingRoutes = new Hono();

meetingRoutes.use('*', withSupabase({ auth: 'user' }));

const meetingSelect =
  '*, apartment:apartments(*), organizer:profiles!meetings_organizer_id_fkey(*), with_user:profiles!meetings_with_user_id_fkey(*)';

meetingRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims!.id;
  const conversationId = c.req.query('conversation_id');

  let query = supabase
    .from('meetings')
    .select(meetingSelect)
    .or(`organizer_id.eq.${userId},with_user_id.eq.${userId}`)
    .order('starts_at', { ascending: true });

  if (conversationId) {
    query = query.eq('conversation_id', conversationId);
  }

  const { data, error } = await query;
  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

meetingRoutes.post('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims!.id;
  const body = await c.req.json<{
    apartment_id: string;
    with_user_id: string;
    starts_at: string;
    notes?: string;
    conversation_id?: string;
  }>();

  if (!body.apartment_id || !body.with_user_id || !body.starts_at) {
    return badRequest(c, 'apartment_id, with_user_id and starts_at are required');
  }
  if (body.with_user_id === userId) {
    return badRequest(c, 'cannot schedule a meeting with yourself');
  }

  const starts = new Date(body.starts_at);
  if (Number.isNaN(starts.getTime()) || starts.getTime() < Date.now() - 60_000) {
    return badRequest(c, 'starts_at must be a valid future time');
  }

  // Propose meeting — becomes scheduled only after the other side accepts
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      apartment_id: body.apartment_id,
      organizer_id: userId,
      with_user_id: body.with_user_id,
      starts_at: body.starts_at,
      notes: body.notes ?? null,
      conversation_id: body.conversation_id ?? null,
      status: 'proposed',
      organizer_accepted: true,
      invitee_accepted: false,
    } as never)
    .select(meetingSelect)
    .single();

  if (error) return badRequest(c, error.message);

  // Notify invitee
  await supabase.from('notifications').insert({
    user_id: body.with_user_id,
    type: 'meeting_proposed',
    title: 'הצעת פגישה חדשה',
    body: 'מישהו הציע פגישה — אשר/י או דחה/י',
    data: {
      meeting_id: data.id,
      conversation_id: body.conversation_id ?? null,
      apartment_id: body.apartment_id,
    },
  });

  return ok(c, data);
});

meetingRoutes.post('/:id/respond', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims!.id;
  const id = c.req.param('id');
  const body = await c.req.json<{ accepted: boolean }>().catch(() => ({ accepted: false }));

  const { data: meeting, error: fetchErr } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !meeting) return badRequest(c, fetchErr?.message ?? 'meeting not found');
  if (meeting.status !== 'proposed') {
    return badRequest(c, 'meeting is not waiting for a response');
  }

  const isOrganizer = meeting.organizer_id === userId;
  const isInvitee = meeting.with_user_id === userId;
  if (!isOrganizer && !isInvitee) return badRequest(c, 'not a participant');

  if (!body.accepted) {
    const { data, error } = await supabase
      .from('meetings')
      .update({
        status: 'declined',
        organizer_accepted: isOrganizer ? false : meeting.organizer_accepted,
        invitee_accepted: isInvitee ? false : meeting.invitee_accepted,
      } as never)
      .eq('id', id)
      .select(meetingSelect)
      .single();
    if (error) return badRequest(c, error.message);

    const notifyId = isOrganizer ? meeting.with_user_id : meeting.organizer_id;
    await supabase.from('notifications').insert({
      user_id: notifyId,
      type: 'meeting_declined',
      title: 'הפגישה נדחתה',
      body: 'הצד השני דחה את הצעת הפגישה',
      data: { meeting_id: id, conversation_id: meeting.conversation_id },
    });

    return ok(c, data);
  }

  // Accept
  const organizer_accepted = isOrganizer ? true : meeting.organizer_accepted;
  const invitee_accepted = isInvitee ? true : meeting.invitee_accepted;
  const bothAccepted = organizer_accepted && invitee_accepted;

  const { data, error } = await supabase
    .from('meetings')
    .update({
      organizer_accepted,
      invitee_accepted,
      status: bothAccepted ? 'scheduled' : 'proposed',
    } as never)
    .eq('id', id)
    .select(meetingSelect)
    .single();

  if (error) return badRequest(c, error.message);

  if (bothAccepted) {
    const notifyId = isOrganizer ? meeting.with_user_id : meeting.organizer_id;
    await supabase.from('notifications').insert({
      user_id: notifyId,
      type: 'meeting_confirmed',
      title: 'הפגישה אושרה!',
      body: 'שני הצדדים אישרו — הפגישה ביומן',
      data: { meeting_id: id, conversation_id: meeting.conversation_id },
    });
  }

  return ok(c, data);
});
