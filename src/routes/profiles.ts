import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors';
import { getSupabaseContext } from '../lib/hono-context';

export const profileRoutes = new Hono();

profileRoutes.use('*', withSupabase({ auth: 'user' }));

profileRoutes.get('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userClaims!.id)
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

profileRoutes.patch('/', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const patch = await c.req.json<Record<string, unknown>>();

  delete patch.id;
  delete patch.created_at;
  delete patch.updated_at;
  delete patch.email;
  delete patch.user_path;

  const allowed = new Set([
    'username',
    'full_name',
    'phone',
    'bio',
    'age',
    'occupation',
    'marital_status',
    'hobbies',
    'avatar_url',
    'socials',
  ]);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) delete patch[key];
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userClaims!.id)
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});

const AVATAR_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function avatarFileType(file: File): { contentType: string; ext: string } | null {
  const raw = (file.type || '').toLowerCase().split(';')[0].trim();
  const aliases: Record<string, string> = {
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
    'image/jfif': 'image/jpeg',
  };
  let contentType = aliases[raw] ?? raw;
  if (!AVATAR_EXT[contentType]) {
    const fromName = file.name?.split('.').pop()?.toLowerCase() ?? '';
    const byExt: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
    };
    contentType = byExt[fromName] ?? '';
  }
  const ext = AVATAR_EXT[contentType];
  if (!ext) return null;
  return { contentType, ext };
}

profileRoutes.post('/avatar', async (c) => {
  const { supabase, userClaims } = getSupabaseContext(c);
  const userId = userClaims!.id;
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return badRequest(c, 'multipart file is required');
  }

  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === 'string') {
    return badRequest(c, 'file is required');
  }

  const blob = file as File;
  const kind = avatarFileType(blob);
  if (!kind) {
    return badRequest(c, 'אפשר להעלות תמונת JPG, PNG, WEBP או HEIC');
  }
  const path = `${userId}/avatar-${crypto.randomUUID()}.${kind.ext}`;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { error: upErr } = await supabase.storage.from('reels').upload(path, bytes, {
    contentType: kind.contentType,
    upsert: false,
  });
  if (upErr) return badRequest(c, upErr.message);

  const { data: pub } = supabase.storage.from('reels').getPublicUrl(path);
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: pub.publicUrl })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) return badRequest(c, error.message);
  return ok(c, data);
});
