import type { Context } from 'hono';

export function badRequest(c: Context, message: string) {
  return c.json({ error: message }, 400);
}

export function unauthorized(c: Context, message = 'Unauthorized') {
  return c.json({ error: message }, 401);
}

export function notFound(c: Context, message = 'Not found') {
  return c.json({ error: message }, 404);
}

export function ok<T>(c: Context, data: T) {
  return c.json({ data });
}
