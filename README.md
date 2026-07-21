# RooMate API

Hono REST API for the RooMate mobile app. All client traffic goes through this backend to Supabase Postgres.

```
Mobile  →  RooMate API  →  Supabase Postgres
```

## Local development (Node.js server)

```powershell
copy .env.example .env
# Set SUPABASE_SECRET_KEY in .env
npm install
npm run dev
```

Health check: `http://localhost:8787/health`

## Deploy to Vercel

1. Import [github.com/chay0354/roomate-back](https://github.com/chay0354/roomate-back) on [Vercel](https://vercel.com/new).
2. Vercel runs `npm run build` → bundles `api/handler.ts` into `api/index.js`.
3. Add these **Environment Variables** in the Vercel project settings:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://admauaereitgjwunyuta.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_...` key |
| `SUPABASE_SECRET_KEY` | your `sb_secret_...` key |
| `SUPABASE_JWKS_URL` | `https://admauaereitgjwunyuta.supabase.co/auth/v1/.well-known/jwks.json` |

4. Deploy. Test: `https://your-project.vercel.app/health`

Set in the mobile app:

```
EXPO_PUBLIC_API_URL=https://roomate-back.vercel.app
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable API key |
| `SUPABASE_SECRET_KEY` | Secret key (required for auth) |
| `SUPABASE_JWKS_URL` | JWKS URL for JWT verification |
| `PORT` | Local dev port (default `8787`) |

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
