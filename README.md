# Metacord - Your Personal Discord Server Directory

Metacord is a personal Discord server directory, allowing to keep track of current (and previous) servers, adding notes, keeping track of invite links (so you can leave and rejoin later), etc...

## Features

- **Discord OAuth Login** - One-click authentication with PKCE flow
- **Server List** - View all servers with icons, names, and join dates
- **Organization** - Favorites, custom nicknames, and personal notes
- **Filters** - Partner, Verified, Boosted, Discoverable, Owner
- **Search** - Filter servers by name in real-time
- **Export/Import** - Backup and restore your user data (JSON)
- **Demo Mode** - Preview UI without OAuth setup via `?demo=1`

## Architecture

- **Frontend**: Static SPA (Vite + TypeScript) served by Cloudflare Workers assets
- **Backend**: Hono catch-all router in a Workers entry (`/api/*`)
- **Auth**: Discord OAuth with PKCE, AES-GCM encrypted tokens in Workers KV
- **Storage**: KV for sessions, localStorage for user preferences

## Development

### Prerequisites

- Node.js 18+ with pnpm
- Cloudflare account
- Discord application ([discord.com/developers](https://discord.com/developers/applications))

### Setup

1. Clone and install:

   ```bash
   pnpm install
   ```

2. Create Discord application:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create new application, go to OAuth2 settings
   - Add redirect URL: `http://localhost:8787/api/auth/callback`
   - Copy Client ID and Client Secret

3. Create KV namespace:

   ```bash
   pnpm wrangler kv:namespace create "SESSIONS"
   pnpm wrangler kv:namespace create "SESSIONS" --preview
   ```

   Add the IDs to `wrangler.toml`

4. Configure local secrets for Wrangler:

   ```bash
   cp .dev.vars.development.example .dev.vars.development
   # Edit .dev.vars.development with your Discord credentials, SESSION_SECRET, and DEV_ASSETS_URL
   ```

5. Start development:

   ```bash
   pnpm dev
   ```

Local development runs Vite on `http://localhost:5173` and Wrangler on `http://localhost:8787`. Wrangler v4 no longer supports `--proxy`, so the worker proxies non-API requests to the Vite dev server when `DEV_ASSETS_URL` is set (defaulted in `.dev.vars.development.example`) while keeping HMR active.

> **Tip**: Use `?demo=1` to preview the UI without setting up OAuth. Demo mode loads mock data from a `guilds_api.json` that you can extract from the Console of your browser in a logged in session.

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run Vite + Wrangler concurrently |
| `pnpm build` | Build frontend for production |
| `pnpm preview` | Preview production build locally |

### Deployment

See `docs/deployment.md`.

## Project Structure

```
metacord/
├── src/
│   ├── index.html          # SPA entry point
│   ├── main.ts             # Application logic
│   ├── worker.ts           # Cloudflare Worker entry (assets + API)
│   ├── style.css           # Styles with CSS variables
│   ├── components/         # UI components (modal, serverCard, toast)
│   └── lib/                # Frontend helpers (api, storage, utils)
├── functions/
│   ├── api/
│   │   └── [[route]].ts    # Hono catch-all router
│   └── lib/                # Backend helpers (session, cache, crypto, cookies, http, types)
├── shared/                 # Shared types (placeholder)
├── docs/
│   └── PRD.md              # Product requirements
├── vite.config.ts          # Vite build config
├── wrangler.toml           # Cloudflare config
├── tsconfig.json           # TypeScript config
└── .dev.vars.development.example # Local Wrangler dev secrets template
```

## License

Private - Personal use only
