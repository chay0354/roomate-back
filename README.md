# RooMate API

Hono REST API for the RooMate mobile app. All client traffic goes through this backend to Supabase Postgres.

```
Mobile  →  RooMate API  →  Supabase
```

## Local development

```powershell
cp .env.example .env
# Set SUPABASE_SECRET_KEY in .env
npm install
npm run dev
```

Health check: `http://localhost:8787/health`

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Vercel auto-detects the `api/` serverless function — **no build step is required** (`vercel.json` sets `buildCommand` to empty).
4. Add environment variables (Production + Preview):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` |
| `SUPABASE_JWKS_URL` | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |

5. Deploy. All routes are served from the single serverless function via `vercel.json` rewrites.

After deploy, set the mobile app env:

```
EXPO_PUBLIC_API_URL=https://your-project.vercel.app
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
