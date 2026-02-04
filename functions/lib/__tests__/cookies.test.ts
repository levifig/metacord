import { describe, it, expect } from 'vitest';
import { parseCookies, serializeCookie } from '../cookies';

describe('parseCookies', () => {
  it('returns empty object for null input', () => {
    expect(parseCookies(null)).toEqual({});
  });

  it('returns empty object for empty string', () => {
    expect(parseCookies('')).toEqual({});
  });

  it('parses a single cookie', () => {
    expect(parseCookies('name=value')).toEqual({ name: 'value' });
  });

  it('parses multiple cookies', () => {
    const result = parseCookies('name=value; session=abc123; theme=dark');
    expect(result).toEqual({
      name: 'value',
      session: 'abc123',
      theme: 'dark',
    });
  });

  it('handles whitespace around cookies', () => {
    const result = parseCookies('  name=value ;  session=abc123  ');
    expect(result).toEqual({
      name: 'value',
      session: 'abc123',
    });
  });

  it('handles cookies with = in value', () => {
    const result = parseCookies('token=abc=def=ghi');
    expect(result).toEqual({ token: 'abc=def=ghi' });
  });

  it('handles cookie with empty value', () => {
    const result = parseCookies('empty=');
    expect(result).toEqual({ empty: '' });
  });
});

describe('serializeCookie', () => {
  it('serializes a basic cookie with default path', () => {
    const result = serializeCookie('name', 'value');
    expect(result).toBe('name=value; Path=/');
  });

  it('encodes the value with encodeURIComponent', () => {
    const result = serializeCookie('name', 'hello world');
    expect(result).toBe('name=hello%20world; Path=/');
  });

  it('includes Max-Age when specified', () => {
    const result = serializeCookie('name', 'value', { maxAge: 3600 });
    expect(result).toContain('Max-Age=3600');
  });

  it('includes HttpOnly when specified', () => {
    const result = serializeCookie('name', 'value', { httpOnly: true });
    expect(result).toContain('HttpOnly');
  });

  it('does not include HttpOnly when false', () => {
    const result = serializeCookie('name', 'value', { httpOnly: false });
    expect(result).not.toContain('HttpOnly');
  });

  it('includes Secure when specified', () => {
    const result = serializeCookie('name', 'value', { secure: true });
    expect(result).toContain('Secure');
  });

  it('does not include Secure when false', () => {
    const result = serializeCookie('name', 'value', { secure: false });
    expect(result).not.toContain('Secure');
  });

  it('includes SameSite when specified', () => {
    const result = serializeCookie('name', 'value', { sameSite: 'Strict' });
    expect(result).toContain('SameSite=Strict');
  });

  it('supports SameSite=None', () => {
    const result = serializeCookie('name', 'value', { sameSite: 'None' });
    expect(result).toContain('SameSite=None');
  });

  it('supports SameSite=Lax', () => {
    const result = serializeCookie('name', 'value', { sameSite: 'Lax' });
    expect(result).toContain('SameSite=Lax');
  });

  it('uses custom path when specified', () => {
    const result = serializeCookie('name', 'value', { path: '/api' });
    expect(result).toContain('Path=/api');
    expect(result).not.toContain('Path=/;');
  });

  it('includes all options together', () => {
    const result = serializeCookie('session', 'abc123', {
      maxAge: 86400,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    });
    expect(result).toBe(
      'session=abc123; Max-Age=86400; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('supports Max-Age of 0 (for deletion)', () => {
    const result = serializeCookie('name', '', { maxAge: 0 });
    expect(result).toContain('Max-Age=0');
  });
});
