export type SameSite = 'Lax' | 'Strict' | 'None';

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSite;
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((cookie) => {
      const [key, ...value] = cookie.trim().split('=');
      return [key, value.join('=')];
    })
  );
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }
  segments.push(`Path=${options.path ?? '/'}`);
  if (options.httpOnly) {
    segments.push('HttpOnly');
  }
  if (options.secure) {
    segments.push('Secure');
  }
  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  return segments.join('; ');
}
