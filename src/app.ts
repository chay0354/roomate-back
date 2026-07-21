import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { applicationRoutes } from './routes/applications.js';
import { apartmentRoutes } from './routes/apartments.js';
import { authRoutes } from './routes/auth.js';
import { conversationRoutes } from './routes/conversations.js';
import { favoriteRoutes } from './routes/favorites.js';
import { meetingRoutes } from './routes/meetings.js';
import { notificationRoutes } from './routes/notifications.js';
import { profileRoutes } from './routes/profiles.js';

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
