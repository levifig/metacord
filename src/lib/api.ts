import type { DiscordGuild, DiscordUser, WidgetData } from '../../shared/types';

/** User info returned by the /api/me endpoint */
export type ApiUser = Pick<DiscordUser, 'id' | 'username' | 'avatar'>;

/** Guild object returned by the /api/guilds endpoint */
export type ApiGuild = DiscordGuild;

/** Member info returned by the /api/guilds/:id endpoint */
export interface ApiGuildMember {
  guild_id: string;
  joined_at?: string | null;
  roles?: string[];
  nickname?: string | null;
  avatar?: string | null;
}

/** Widget data returned by the /api/widget/:id endpoint */
export type ApiWidget = WidgetData;

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  retryAfter: number | null;
  constructor(retryAfter: number | null = null) {
    super('Rate limited');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

const DEFAULT_HEADERS: HeadersInit = {
  Accept: 'application/json',
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...options.headers,
    },
    credentials: 'include',
  });

  if (response.status === 401) {
    throw new AuthError();
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : null);
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

interface MeResponse {
  authenticated: boolean;
  user?: ApiUser;
  reason?: string;
}

interface GuildsResponse {
  guilds: ApiGuild[];
}

export async function fetchMe(): Promise<ApiUser> {
  const response = await apiRequest<MeResponse>('/api/me');
  if (!response.authenticated || !response.user) {
    throw new AuthError(response.reason ?? 'Not authenticated');
  }
  return response.user;
}

export async function fetchGuilds(): Promise<ApiGuild[]> {
  const response = await apiRequest<GuildsResponse>('/api/guilds');
  return response.guilds;
}

export function fetchGuildMember(guildId: string): Promise<ApiGuildMember> {
  return apiRequest<ApiGuildMember>(`/api/guilds/${guildId}`);
}

export function fetchWidget(guildId: string): Promise<ApiWidget> {
  return apiRequest<ApiWidget>(`/api/widget/${guildId}`);
}

export async function logout(): Promise<void> {
  await apiRequest('/api/auth/logout', { method: 'POST' });
}
