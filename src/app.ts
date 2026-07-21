import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { applicationRoutes } from './routes/applications';
import { apartmentRoutes } from './routes/apartments';
import { authRoutes } from './routes/auth';
import { conversationRoutes } from './routes/conversations';
import { favoriteRoutes } from './routes/favorites';
import { meetingRoutes } from './routes/meetings';
import { notificationRoutes } from './routes/notifications';
import { profileRoutes } from './routes/profiles';

export function createApp() {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    })
  );

  app.get('/', (c) =>
    c.json({
      ok: true,
      service: 'roomate-api',
      docs: '/health',
    })
  );

  app.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'roomate-api',
      architecture: 'mobile -> api -> supabase',
    })
  );

  app.route('/auth', authRoutes);
  app.route('/apartments', apartmentRoutes);
  app.route('/favorites', favoriteRoutes);
  app.route('/applications', applicationRoutes);
  app.route('/conversations', conversationRoutes);
  app.route('/meetings', meetingRoutes);
  app.route('/notifications', notificationRoutes);
  app.route('/me/profile', profileRoutes);

  return app;
}

export const app = createApp();
