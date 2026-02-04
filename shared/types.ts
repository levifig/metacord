/** Discord API user object (GET /users/@me) */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
}

/** Discord API guild object (GET /users/@me/guilds) */
export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  owner: boolean;
  features: string[];
}

/** Discord API guild member object (GET /users/@me/guilds/:id/member) */
export interface DiscordMember {
  user?: DiscordUser;
  nick: string | null;
  avatar: string | null;
  roles: string[];
  joined_at: string;
}

/** Subset of Discord widget response used by both frontend and backend */
export interface WidgetData {
  instant_invite: string | null;
  presence_count: number | null;
}
