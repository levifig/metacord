# DSM (Discord Server Manager)

Personal Discord server directory with OAuth authentication.

## Features

- **Discord OAuth Login** - One-click authentication with PKCE flow
- **Server List** - View all servers with icons, names, and join dates
- **Organization** - Favorites, custom nicknames, and personal notes
- **Filters** - Partner, Verified, Boosted, Discoverable, Owner
- **Search** - Filter servers by name in real-time
- **Export/Import** - Backup and restore your user data (JSON)
- **Demo Mode** - Preview UI without OAuth setup via `?demo=1`

## Architecture

- **Frontend**: Static SPA (Vite + TypeScript) on Cloudflare Pages
- **Backend**: Hono catch-all router in Pages Functions (`/api/*`)
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
   - Add redirect URL: `http://localhost:8788/api/auth/callback`
   - Copy Client ID and Client Secret

3. Create KV namespace:
   ```bash
   pnpm wrangler kv:namespace create "SESSIONS"
   pnpm wrangler kv:namespace create "SESSIONS" --preview
   ```
   Add the IDs to `wrangler.toml`

4. Configure secrets (requires [direnv](https://direnv.net/)):
   ```bash
   cp .envrc.example .envrc
   # Edit .envrc with your Discord credentials and SESSION_SECRET
   direnv allow
   ```

5. Start development:
   ```bash
   pnpm dev
   ```

> **Tip**: Use `?demo=1` to preview the UI without setting up OAuth. Demo mode loads mock data from `tmp/guilds_api.json`.

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run Vite + Wrangler concurrently |
| `pnpm build` | Build frontend for production |
| `pnpm preview` | Preview production build locally |

### Deployment

1. Connect GitHub repo to Cloudflare Pages
2. Set environment variables in Cloudflare dashboard:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `SESSION_SECRET`
3. Update `DISCORD_REDIRECT_URI` in `wrangler.toml` for production
4. Add production redirect URL to Discord application

## Project Structure

```
discord-manager/
├── src/
│   ├── index.html          # SPA entry point
│   ├── main.ts             # Application logic
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
└── .envrc.example          # Environment template (direnv)
```

## License

Private - Personal use only
