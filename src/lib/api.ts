export interface ApiUser {
  id: string;
  username: string;
  avatar?: string | null;
}

export interface ApiGuild {
  id: string;
  name: string;
  icon?: string | null;
  banner?: string | null;
  owner: boolean;
  features: string[];
}

export interface ApiGuildMember {
  id: string;
  joined_at?: string | null;
  roles?: string[];
  nick?: string | null;
}

export interface ApiWidget {
  instant_invite: string | null;
  presence_count: number | null;
}

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
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
