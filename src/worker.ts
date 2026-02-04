import { app } from '../functions/api/[[route]]';
import type { Env } from '../functions/lib/types';

// Re-export DO class for wrangler to bundle
export { DiscordRateLimiter } from '../functions/lib/discord-rate-limiter';

interface WorkerEnv extends Env {
  ASSETS: Fetcher;
}

const API_PREFIX = '/api';

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith(API_PREFIX)) {
      return app.fetch(request, env, ctx);
    }

    if (env.DEV_ASSETS_URL && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
      const devUrl = new URL(env.DEV_ASSETS_URL);
      devUrl.pathname = url.pathname;
      devUrl.search = url.search;

      return fetch(new Request(devUrl.toString(), request));
    }

    return env.ASSETS.fetch(request);
  },
};
