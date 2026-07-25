import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, notFound, ok } from '../lib/errors';
import { getSupabaseContext } from '../lib/hono-context';
import { getAnonClient } from '../lib/supabase-anon';

export const reelRoutes = new Hono();

const reelSelect =
  '*, author:profiles!reels_user_id_fkey(*), apartment:apartments(*, owner:profiles!apartments_owner_id_fkey(*))';

reelRoutes.get('/', async (c) => {
  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from('reels')
    .select(reelSelect)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return badRequest(c, error.message);
  return ok(c, data ?? []);
});

reelRoutes.get('/me/liked-ids', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const { data, error } = await supabase
    .from('reel_likes')
    .select('reel_id')
    .eq('user_id', userClaims!.id);
  if (error) return badRequest(c, error.message);
  return ok(
    c,
    (data ?? []).map((r) => r.reel_id)
  );
});

reelRoutes.get('/:id/comments', async (c) => {
  const supabase = getAnonClient();
  const id = c.req.param('id');
  const { data, error } = await supabase
    .from('reel_comments')
    .select('*, author:profiles!user_id(*)')
    .eq('reel_id', id)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    // Fallback if FK hint name differs across environments
    const retry = await supabase
      .from('reel_comments')
      .select('*, author:profiles(*)')
      .eq('reel_id', id)
      .order('created_at', { ascending: true })
      .limit(100);
    if (retry.error) return badRequest(c, error.message);
    return ok(c, retry.data ?? []);
  }
  return ok(c, data ?? []);
});

reelRoutes.post('/', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims!.id;
  const contentType = c.req.header('content-type') ?? '';

  let kind: string | undefined;
  let caption: string | null = null;
  let apartmentId: string | null = null;
  let mediaUrl: string | undefined;
  let thumbnailUrl: string | null = null;

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.parseBody();
    kind = String(form.kind ?? '');
    caption = form.caption ? String(form.caption) : null;
    apartmentId = form.apartment_id ? String(form.apartment_id) : null;

    const file = form.file;
    if (!file || typeof file === 'string') {
      return badRequest(c, 'file is required');
    }

    const blob = file as File;
    const ext =
      blob.name?.split('.').pop()?.toLowerCase() ||
      (kind === 'image' ? 'jpg' : 'mp4');
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { error: upErr } = await supabase.storage.from('reels').upload(path, bytes, {
      contentType: blob.type || (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
      upsert: false,
    });
    if (upErr) return badRequest(c, upErr.message);

    const { data: pub } = supabase.storage.from('reels').getPublicUrl(path);
    mediaUrl = pub.publicUrl;
    if (kind === 'image') thumbnailUrl = mediaUrl;
  } else {
    const body = await c.req.json<{
      kind: string;
      media_url: string;
      thumbnail_url?: string | null;
      caption?: string | null;
      apartment_id?: string | null;
    }>();
    kind = body.kind;
    mediaUrl = body.media_url;
    thumbnailUrl = body.thumbnail_url ?? null;
    caption = body.caption ?? null;
    apartmentId = body.apartment_id ?? null;
  }

  if (!kind || !['image', 'video', 'apartment_tour'].includes(kind)) {
    return badRequest(c, 'kind must be image, video, or apartment_tour');
  }
  if (!mediaUrl) return badRequest(c, 'media_url is required');
  if (kind === 'apartment_tour' && !apartmentId) {
    return badRequest(c, 'apartment_id is required for apartment_tour');
  }

  // Apartment tours are only for landlords (dira), not seekers (dayer)
  if (kind === 'apartment_tour') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_path')
      .eq('id', userId)
      .single();
    if (profile?.user_path !== 'dira') {
      return badRequest(c, 'only apartment owners can upload apartment tours');
    }
  }

  // Tours (and any linked apartment) must belong to the uploader
  if (apartmentId) {
    const { data: apt, error: aptErr } = await supabase
      .from('apartments')
      .select('id, owner_id')
      .eq('id', apartmentId)
      .single();
    if (aptErr || !apt) return badRequest(c, 'apartment not found');
    if (apt.owner_id !== userId) {
      return badRequest(c, 'you can only link apartments you own');
    }
  }

  const { data, error } = await supabase
    .from('reels')
    .insert({
      user_id: userId,
      kind,
      media_url: mediaUrl,
      thumbnail_url: thumbnailUrl,
      caption,
      apartment_id: apartmentId,
    })
    .select(reelSelect)
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

reelRoutes.post('/:id/like', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const reelId = c.req.param('id');
  const body = await c.req.json<{ liked: boolean }>().catch(() => ({ liked: true }));

  if (body.liked === false) {
    const { error } = await supabase
      .from('reel_likes')
      .delete()
      .eq('reel_id', reelId)
      .eq('user_id', userClaims!.id);
    if (error) return badRequest(c, error.message);
  } else {
    const { error } = await supabase.from('reel_likes').upsert({
      reel_id: reelId,
      user_id: userClaims!.id,
    });
    if (error) return badRequest(c, error.message);
  }

  const { data } = await supabase.from('reels').select('likes_count').eq('id', reelId).single();
  return ok(c, { liked: body.liked !== false, likes_count: data?.likes_count ?? 0 });
});

reelRoutes.post('/:id/comments', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const reelId = c.req.param('id');
  const body = await c.req.json<{ body: string }>();
  if (!body.body?.trim()) return badRequest(c, 'body is required');

  const { data, error } = await supabase
    .from('reel_comments')
    .insert({
      reel_id: reelId,
      user_id: userClaims!.id,
      body: body.body.trim(),
    })
    .select('*, author:profiles!user_id(*)')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

reelRoutes.get('/:id', async (c) => {
  const supabase = getAnonClient();
  const { data, error } = await supabase
    .from('reels')
    .select(reelSelect)
    .eq('id', c.req.param('id'))
    .single();
  if (error) return notFound(c, error.message);
  return ok(c, data);
});
