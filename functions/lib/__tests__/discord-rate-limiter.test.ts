import { describe, it, expect, beforeEach } from 'vitest';
import { env, runInDurableObject, createDurableObjectId } from 'cloudflare:test';
import { DiscordRateLimiter } from '../discord-rate-limiter';

describe('DiscordRateLimiter', () => {
  let id: DurableObjectId;

  beforeEach(() => {
    id = env.DISCORD_RATE_LIMITER.newUniqueId();
  });

  describe('getState', () => {
    it('returns default state on fresh instance', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      const state = await stub.getState();
      expect(state.limit).toBe(5);
      expect(state.remaining).toBe(3); // 5 - 2 (RESERVE_BUFFER)
      expect(state.resetAt).toBe(0);
      expect(state.bucket).toBeNull();
      expect(state.isGlobal).toBe(false);
      expect(state.scope).toBeNull();
      expect(state.queueLength).toBe(0);
      expect(state.activeRequests).toBe(0);
    });
  });

  describe('acquireSlot', () => {
    it('returns allowed when slots are available', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      const result = await stub.acquireSlot();
      expect(result.allowed).toBe(true);
    });

    it('increments activeRequests on acquire', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      await stub.acquireSlot();
      const state = await stub.getState();
      expect(state.activeRequests).toBe(1);
    });

    it('allows multiple requests up to effective remaining', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      // Default: limit=5, remaining=3 (5 - RESERVE_BUFFER of 2)
      // effective = remaining - RESERVE_BUFFER - activeRequests
      // With stale state (lastUpdated=0), effective = max(0, 5 - 2 - active)
      const r1 = await stub.acquireSlot();
      const r2 = await stub.acquireSlot();
      const r3 = await stub.acquireSlot();
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);

      const state = await stub.getState();
      expect(state.activeRequests).toBe(3);
    });
  });

  describe('releaseSlot', () => {
    it('decrements activeRequests', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      await stub.acquireSlot();
      await stub.acquireSlot();
      let state = await stub.getState();
      expect(state.activeRequests).toBe(2);

      await stub.releaseSlot();
      state = await stub.getState();
      expect(state.activeRequests).toBe(1);
    });

    it('does not go below zero', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      await stub.releaseSlot();
      const state = await stub.getState();
      expect(state.activeRequests).toBe(0);
    });
  });

  describe('updateFromResponse', () => {
    it('updates state from Discord rate limit headers', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      await stub.updateFromResponse({
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '8',
        'x-ratelimit-reset': '1700000000.000',
        'x-ratelimit-reset-after': '5.0',
        'x-ratelimit-bucket': 'abc123',
        'x-ratelimit-global': null,
        'x-ratelimit-scope': 'user',
      });

      const state = await stub.getState();
      expect(state.limit).toBe(10);
      expect(state.remaining).toBe(8);
      expect(state.resetAt).toBe(1700000000);
      expect(state.resetAfter).toBe(5);
      expect(state.bucket).toBe('abc123');
      expect(state.scope).toBe('user');
      expect(state.lastUpdated).toBeGreaterThan(0);
    });

    it('does not update when no meaningful headers present', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      await stub.updateFromResponse({
        'x-ratelimit-limit': null,
        'x-ratelimit-remaining': null,
        'x-ratelimit-reset': null,
        'x-ratelimit-reset-after': null,
        'x-ratelimit-bucket': null,
        'x-ratelimit-global': null,
        'x-ratelimit-scope': null,
      });

      const state = await stub.getState();
      // Should remain at defaults since no meaningful headers
      expect(state.limit).toBe(5);
      expect(state.lastUpdated).toBe(0);
    });

    it('updates isGlobal when global header is true', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      await stub.updateFromResponse({
        'x-ratelimit-limit': '10',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': null,
        'x-ratelimit-reset-after': null,
        'x-ratelimit-bucket': null,
        'x-ratelimit-global': 'true',
        'x-ratelimit-scope': null,
      });

      const state = await stub.getState();
      expect(state.isGlobal).toBe(true);
    });
  });

  describe('handleRateLimited', () => {
    it('zeros remaining and sets reset time', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);
      const beforeMs = Date.now();
      await stub.handleRateLimited(5);
      const afterMs = Date.now();

      const state = await stub.getState();
      expect(state.remaining).toBe(0);
      expect(state.resetAfter).toBe(5);
      // resetAt should be (now/1000) + 5
      const expectedResetAtMin = (beforeMs / 1000) + 5;
      const expectedResetAtMax = (afterMs / 1000) + 5;
      expect(state.resetAt).toBeGreaterThanOrEqual(expectedResetAtMin);
      expect(state.resetAt).toBeLessThanOrEqual(expectedResetAtMax);
      expect(state.lastUpdated).toBeGreaterThan(0);
    });
  });

  describe('acquire and release flow', () => {
    it('frees slots after release allowing new acquires', async () => {
      const stub = env.DISCORD_RATE_LIMITER.get(id);

      // Acquire all available slots (with stale state: effective = 5 - 2 - active)
      const results = [];
      for (let i = 0; i < 3; i++) {
        results.push(await stub.acquireSlot());
      }
      expect(results.every((r) => r.allowed)).toBe(true);

      // Release one
      await stub.releaseSlot();

      // Should be able to acquire one more
      const next = await stub.acquireSlot();
      expect(next.allowed).toBe(true);
    });
  });
});
