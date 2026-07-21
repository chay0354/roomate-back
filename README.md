# RooMate API

Standard **Node.js** REST API for the RooMate mobile app (Hono + Supabase).

```
Mobile  →  RooMate API  →  Supabase Postgres
```

## Local development

```powershell
copy .env.example .env
# Set SUPABASE_SECRET_KEY in .env
npm install
npm run dev
```

Health check: `http://localhost:8787/health`

Production:

```powershell
npm install
npm start
```

On Render/Railway, set **Start Command** to `npm start` (no separate build step required).

## Environment variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` |
| `SUPABASE_JWKS_URL` | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `PORT` | Server port (default `8787`; platforms like Render set this automatically) |

## Deploy (Node.js host)

Works on any Node 20+ host that runs `npm install` and `npm start`:

- [Render](https://render.com) — Web Service, start `npm start`
- [Railway](https://railway.app) — detects Node, uses `Procfile`
- [Fly.io](https://fly.io), VPS, etc.

After deploy, set in the mobile app:

```
EXPO_PUBLIC_API_URL=https://your-api-host.com
```

## API routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | Public |
| POST | `/auth/signup`, `/auth/signin`, `/auth/refresh` | Public |
| POST | `/auth/signout` | User JWT |
| GET | `/apartments`, `/apartments/:id` | Public |
| POST | `/apartments` | User JWT |
| GET/POST | `/favorites/*` | User JWT |
| GET/POST | `/applications/*` | User JWT |
| GET/POST | `/conversations/*` | User JWT |
| GET/POST | `/meetings` | User JWT |
| GET/PATCH/POST | `/notifications/*` | User JWT |
| GET/PATCH | `/me/profile` | User JWT |
