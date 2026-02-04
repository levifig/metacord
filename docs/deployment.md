# Deployment Checklist

Deployment checklist for Metacord - Your Personal Discord Server Directory.

## Branch strategy

- `main` is production
- `dev` is dev environment
- `feature/*`, `fix/*`, `chore/*` branches merge into `dev`
- Periodic PR from `dev` to `main`
- Tag semantic versions on `main` (example: `v1.4.2`)

## Deployment commands

```bash
# Deploy to production (main branch)
pnpm run deploy

# Deploy to development (dev branch)
pnpm run deploy:dev
```

## Local dev secrets

Wrangler reads local Worker secrets from `.dev.vars.development` when using `wrangler dev --env development`.
Copy `.dev.vars.development.example` to `.dev.vars.development` for local development instead of using `.envrc`.

## Cloudflare Workers

Metacord runs as Cloudflare Workers with static assets served from the bundled `dist` directory.

### Production worker
- **Worker name**: `metacord-prod`
- **Branch**: `main`
- **Custom domain**: `metacord.app`
- **Deploy command**: `pnpm run deploy`
- **KV namespace binding**: `SESSIONS`
- **Env vars**: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `DISCORD_REDIRECT_URI`

### Development worker
- **Worker name**: `metacord-dev`
- **Branch**: `dev`
- **Custom domain**: `dev.metacord.app`
- **Deploy command**: `pnpm run deploy:dev`
- **KV namespace binding**: `SESSIONS`
- **Env vars**: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `DISCORD_REDIRECT_URI`

### Dashboard setup
- Create two KV namespaces (dev + prod) and fill in the `id` values in `wrangler.toml` for each environment.
- Add Worker routes or custom domains:
  - `metacord.app/*` -> `metacord-prod`
  - `dev.metacord.app/*` -> `metacord-dev`
- Keep `DISCORD_REDIRECT_URI` set per environment in `wrangler.toml`.
- Set secrets per environment (recommended via CLI):
  - `wrangler secret put DISCORD_CLIENT_ID --env production`
  - `wrangler secret put DISCORD_CLIENT_SECRET --env production`
  - `wrangler secret put SESSION_SECRET --env production`
  - `wrangler secret put DISCORD_CLIENT_ID --env development`
  - `wrangler secret put DISCORD_CLIENT_SECRET --env development`
  - `wrangler secret put SESSION_SECRET --env development`

## Branch protection

`main`:
- Require PRs
- Require status checks
- Require linear history
- Block force pushes and deletions

`dev`:
- Require PRs
- Require status checks
- Allow squash merges
