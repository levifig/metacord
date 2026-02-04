import { describe, it, expect } from 'vitest';
import { jsonResponse, errorResponse } from '../http';

describe('jsonResponse', () => {
  it('returns a Response with application/json content-type', () => {
    const res = jsonResponse({ ok: true });
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('returns status 200 by default', () => {
    const res = jsonResponse({ ok: true });
    expect(res.status).toBe(200);
  });

  it('returns the correct JSON body', async () => {
    const data = { message: 'hello', count: 42 };
    const res = jsonResponse(data);
    const body = await res.json();
    expect(body).toEqual(data);
  });

  it('supports custom status codes', () => {
    const res = jsonResponse({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  it('supports custom headers', () => {
    const res = jsonResponse({ ok: true }, 200, {
      'X-Custom-Header': 'test-value',
    });
    expect(res.headers.get('X-Custom-Header')).toBe('test-value');
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('does not override Content-Type if already set in custom headers', () => {
    const res = jsonResponse({ ok: true }, 200, {
      'Content-Type': 'text/plain',
    });
    expect(res.headers.get('Content-Type')).toBe('text/plain');
  });

  it('serializes null body', async () => {
    const res = jsonResponse(null);
    const body = await res.text();
    expect(body).toBe('null');
  });

  it('serializes array body', async () => {
    const res = jsonResponse([1, 2, 3]);
    const body = await res.json();
    expect(body).toEqual([1, 2, 3]);
  });
});

describe('errorResponse', () => {
  it('returns status 400 by default', () => {
    const res = errorResponse('Bad request');
    expect(res.status).toBe(400);
  });

  it('returns the error message in JSON body', async () => {
    const res = errorResponse('Something went wrong');
    const body = await res.json();
    expect(body).toEqual({ error: 'Something went wrong' });
  });

  it('supports custom status codes', () => {
    const res = errorResponse('Not found', 404);
    expect(res.status).toBe(404);
  });

  it('returns application/json content-type', () => {
    const res = errorResponse('Error');
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('supports custom headers', () => {
    const res = errorResponse('Unauthorized', 401, {
      'WWW-Authenticate': 'Bearer',
    });
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(res.status).toBe(401);
  });

  it('handles 500 server error', async () => {
    const res = errorResponse('Internal server error', 500);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
  });
});
