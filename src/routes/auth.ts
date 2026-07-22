import { Hono } from 'hono';
import { withSupabase } from '@supabase/server/adapters/hono';

import { badRequest, ok } from '../lib/errors';
import { getAnonClient } from '../lib/supabase-anon';
import { getServiceClient } from '../lib/supabase-service';

export const authRoutes = new Hono();

authRoutes.post('/signup', async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    full_name: string;
    username: string;
    phone: string;
    user_path: 'dayer' | 'dira';
  }>();

  if (!body.email || !body.password || body.password.length < 6) {
    return badRequest(c, 'Email and password (min 6 chars) are required');
  }

  const email = body.email.trim();
  const meta = {
    full_name: body.full_name?.trim(),
    username: body.username?.trim(),
    phone: body.phone?.trim(),
    user_path: body.user_path ?? 'dayer',
  };

  // Prefer admin createUser with email_confirm so users can sign in immediately
  // (matches Dashboard setting "Confirm email" = off).
  const service = getServiceClient();
  if (service) {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: meta,
    });

    if (createError) {
      // If user already exists, try sign-in path after confirming
      return badRequest(c, createError.message);
    }

    const anon = getAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({
      email,
      password: body.password,
    });

    if (error) {
      return ok(c, {
        session: null,
        user: created.user,
      });
    }

    return ok(c, {
      session: data.session,
      user: data.user ?? created.user,
    });
  }

  const supabase = getAnonClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: body.password,
    options: { data: meta },
  });

  if (error) return badRequest(c, error.message);

  return ok(c, {
    session: data.session,
    user: data.user,
  });
});

authRoutes.post('/signin', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) {
    return badRequest(c, 'Email and password are required');
  }

  const supabase = getAnonClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email.trim(),
    password: body.password,
  });

  if (error) return badRequest(c, error.message);

  return ok(c, {
    session: data.session,
    user: data.user,
  });
});

authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>();
  if (!body.refresh_token) {
    return badRequest(c, 'refresh_token is required');
  }

  const supabase = getAnonClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: body.refresh_token,
  });

  if (error) return badRequest(c, error.message);

  return ok(c, {
    session: data.session,
    user: data.user,
  });
});

authRoutes.post('/signout', withSupabase({ auth: 'user' }), async (c) => {
  const { supabase } = c.var.supabaseContext;
  const { error } = await supabase.auth.signOut();
  if (error) return badRequest(c, error.message);
  return ok(c, { ok: true });
});
