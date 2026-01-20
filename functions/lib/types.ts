export interface Env {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  SESSION_SECRET: string;
  SESSIONS: KVNamespace;
}

export interface SessionRecord {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  created_at: number;
}

export interface SessionData {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  createdAt: number;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  owner: boolean;
  features: string[];
}

export interface DiscordMember {
  user?: DiscordUser;
  nick: string | null;
  avatar: string | null;
  roles: string[];
  joined_at: string;
}

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}
