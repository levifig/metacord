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

## Cloudflare Pages

### Production project
- **Project name**: `metacord-prod`
- **Production branch**: `main`
- **Custom domain**: `metacord.app`
- **Deploy command**: `pnpm run deploy`
- **Env vars**: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `DISCORD_REDIRECT_URI`
- **KV namespace**: `SESSIONS`

### Development project
- **Project name**: `metacord-dev`
- **Production branch**: `dev`
- **Custom domain**: `dev.metacord.app`
- **Deploy command**: `pnpm run deploy:dev`
- **Env vars**: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `DISCORD_REDIRECT_URI`
- **KV namespace**: `SESSIONS`

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
