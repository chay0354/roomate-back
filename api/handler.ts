import { handle } from 'hono/vercel';

import { app } from '../src/app';

const fetch = handle(app);

export default { fetch };
