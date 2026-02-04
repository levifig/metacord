import { serializeCookie, parseCookies } from './cookies';
import { decryptToken, encryptToken } from './crypto';
import { DiscordTokenResponse, Env, SessionData, SessionRecord } from './types';

const SESSION_COOKIE_NAME_SECURE = '__Host-session';
const SESSION_COOKIE_NAME_INSECURE = 'session';
const SESSION_TTL_SECONDS = 60 * 30;
const REFRESH_WINDOW_MS = 5 * 60 * 1000;
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';

export interface SessionContext {
  sessionId: string | null;
  session: SessionData | null;
  setCookie?: string;
  clearCookie?: string;
  secure: boolean;
}

/**
 * Determines if the request is coming from a secure context (HTTPS).
 * Used to decide whether to use __Host- prefixed cookies with secure flag.
 */
export function isSecureContext(request?: Request): boolean {
  if (!request) return true;
  const url = new URL(request.url);
  return url.protocol === 'https:';
}

export function getSessionCookieName(secure: boolean = true): string {
  return secure ? SESSION_COOKIE_NAME_SECURE : SESSION_COOKIE_NAME_INSECURE;
}

export function buildSessionCookie(sessionId: string, secure: boolean = true): string {
  return serializeCookie(getSessionCookieName(secure), sessionId, {
    path: '/',
    httpOnly: true,
    secure: secure,
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function buildClearSessionCookie(secure: boolean = true): string {
  return serializeCookie(getSessionCookieName(secure), '', {
    path: '/',
    httpOnly: true,
    secure: secure,
    sameSite: 'Lax',
    maxAge: 0,
  });
}

export async function getSessionContext(request: Request, env: Env): Promise<SessionContext> {
  const secure = isSecureContext(request);
  const cookieName = getSessionCookieName(secure);
  const cookies = parseCookies(request.headers.get('Cookie'));
  const sessionId = cookies[cookieName];
  if (!sessionId) {
    return { sessionId: null, session: null, secure };
  }

  const record = await env.SESSIONS.get<SessionRecord>(sessionId, 'json');
  if (!record) {
    return { sessionId, session: null, clearCookie: buildClearSessionCookie(secure), secure };
  }

  try {
    const accessToken = await decryptToken(record.access_token, env.SESSION_SECRET);
    const refreshToken = await decryptToken(record.refresh_token, env.SESSION_SECRET);
    let session: SessionData = {
      userId: record.user_id,
      accessToken,
      refreshToken,
      expiresAt: record.expires_at,
      createdAt: record.created_at,
    };

    if (session.expiresAt - Date.now() <= REFRESH_WINDOW_MS) {
      const refreshed = await refreshSession(sessionId, session, env);
      if (!refreshed) {
        await deleteSession(sessionId, env);
        return { sessionId, session: null, clearCookie: buildClearSessionCookie(secure), secure };
      }
      session = refreshed;
    } else {
      await persistSession(sessionId, session, env);
    }

    return {
      sessionId,
      session,
      setCookie: buildSessionCookie(sessionId, secure),
      secure,
    };
  } catch {
    await deleteSession(sessionId, env);
    return { sessionId, session: null, clearCookie: buildClearSessionCookie(secure), secure };
  }
}

export async function persistSession(
  sessionId: string,
  session: SessionData,
  env: Env
): Promise<void> {
  const record: SessionRecord = {
    user_id: session.userId,
    access_token: await encryptToken(session.accessToken, env.SESSION_SECRET),
    refresh_token: await encryptToken(session.refreshToken, env.SESSION_SECRET),
    expires_at: session.expiresAt,
    created_at: session.createdAt,
  };
  await env.SESSIONS.put(sessionId, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(sessionId: string, env: Env): Promise<void> {
  await env.SESSIONS.delete(sessionId);
}

export async function refreshSession(
  sessionId: string,
  session: SessionData,
  env: Env
): Promise<SessionData | null> {
  if (!session.refreshToken) {
    return null;
  }
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const tokenData: DiscordTokenResponse = await response.json();
  const now = Date.now();
  const refreshed: SessionData = {
    userId: session.userId,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? session.refreshToken,
    expiresAt: now + tokenData.expires_in * 1000,
    createdAt: session.createdAt,
  };

  await persistSession(sessionId, refreshed, env);
  return refreshed;
}
