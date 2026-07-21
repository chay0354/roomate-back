import 'dotenv/config';
import { serve } from '@hono/node-server';

import { app } from './app';

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`RooMate API listening on http://0.0.0.0:${port}`);
});
