import { DurableObject } from 'cloudflare:workers';

/**
 * Rate limit state tracked from Discord response headers.
 */
export interface RateLimitState {
  /** Maximum requests allowed in the current window */
  limit: number;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (seconds) when the rate limit resets */
  resetAt: number;
  /** Seconds until the rate limit resets */
  resetAfter: number;
  /** Discord's bucket identifier for this endpoint */
  bucket: string | null;
  /** Whether this is a global rate limit */
  isGlobal: boolean;
  /** Scope of the rate limit (user, global, shared) */
  scope: string | null;
  /** Last time we received rate limit info from Discord */
  lastUpdated: number;
}

/**
 * Result from attempting to acquire a rate limit slot.
 */
export interface AcquireSlotResult {
  /** Whether the request can proceed */
  allowed: boolean;
  /** If not allowed, how long to wait (ms) */
  waitMs?: number;
  /** If queued, a unique ID for this request */
  queueId?: string;
  /** Error message if something went wrong */
  error?: string;
}

/**
 * Queued request waiting for a rate limit slot.
 */
interface QueuedRequest {
  id: string;
  resolve: (result: AcquireSlotResult) => void;
  timeout: ReturnType<typeof setTimeout>;
  addedAt: number;
}

// Configuration constants
const RESERVE_BUFFER = 2; // Keep this many requests in reserve
const QUEUE_TIMEOUT_MS = 7000; // 7 seconds timeout for queued requests
const MAX_QUEUE_SIZE = 150; // Maximum queued requests
const DEFAULT_RATE_LIMIT = 5; // Conservative default if no headers received
const STALE_STATE_MS = 60000; // Consider state stale after 60 seconds

/**
 * Durable Object for coordinating Discord API rate limits across Workers.
 *
 * This DO tracks rate limit state from Discord headers and manages a queue
 * of pending requests to prevent hitting rate limits.
 */
export class DiscordRateLimiter extends DurableObject {
  private rateLimitState: RateLimitState;
  private queue: QueuedRequest[] = [];
  private activeRequests = 0;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.rateLimitState = this.getDefaultState();
  }

  private getDefaultState(): RateLimitState {
    return {
      limit: DEFAULT_RATE_LIMIT,
      remaining: DEFAULT_RATE_LIMIT - RESERVE_BUFFER,
      resetAt: 0,
      resetAfter: 0,
      bucket: null,
      isGlobal: false,
      scope: null,
      lastUpdated: 0,
    };
  }

  /**
   * Check if rate limit state is stale and should be reset.
   */
  private isStateStale(): boolean {
    if (this.rateLimitState.lastUpdated === 0) return true;
    return Date.now() - this.rateLimitState.lastUpdated > STALE_STATE_MS;
  }

  /**
   * Get the effective remaining requests, accounting for reserve buffer.
   */
  private getEffectiveRemaining(): number {
    const now = Date.now();
    const resetAtMs = this.rateLimitState.resetAt * 1000;

    // If we've passed the reset time, assume limit has reset
    if (resetAtMs > 0 && now >= resetAtMs) {
      return this.rateLimitState.limit - RESERVE_BUFFER - this.activeRequests;
    }

    // If state is stale, be conservative
    if (this.isStateStale()) {
      return Math.max(0, DEFAULT_RATE_LIMIT - RESERVE_BUFFER - this.activeRequests);
    }

    return Math.max(0, this.rateLimitState.remaining - RESERVE_BUFFER - this.activeRequests);
  }

  /**
   * Calculate wait time until rate limit resets.
   */
  private getWaitTimeMs(): number {
    const now = Date.now();
    const resetAtMs = this.rateLimitState.resetAt * 1000;

    if (resetAtMs <= now) {
      return 0;
    }

    // Add small buffer to avoid race conditions
    return resetAtMs - now + 100;
  }

  /**
   * Process the queue after a slot becomes available.
   */
  private processQueue(): void {
    while (this.queue.length > 0) {
      const effectiveRemaining = this.getEffectiveRemaining();
      if (effectiveRemaining <= 0) break;

      const next = this.queue.shift();
      if (!next) break;

      clearTimeout(next.timeout);
      this.activeRequests++;
      next.resolve({ allowed: true, queueId: next.id });
    }
  }

  /**
   * Attempt to acquire a rate limit slot for a request.
   * Returns immediately if a slot is available, otherwise queues the request.
   */
  async acquireSlot(): Promise<AcquireSlotResult> {
    const effectiveRemaining = this.getEffectiveRemaining();

    // If we have capacity, allow immediately
    if (effectiveRemaining > 0) {
      this.activeRequests++;
      return { allowed: true };
    }

    // Check queue capacity
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      return {
        allowed: false,
        error: 'Rate limit queue full',
        waitMs: this.getWaitTimeMs(),
      };
    }

    // Queue the request
    return new Promise((resolve) => {
      const queueId = crypto.randomUUID();

      const timeout = setTimeout(() => {
        // Remove from queue on timeout
        const index = this.queue.findIndex((q) => q.id === queueId);
        if (index !== -1) {
          this.queue.splice(index, 1);
          resolve({
            allowed: false,
            error: 'Queue timeout',
            waitMs: this.getWaitTimeMs(),
          });
        }
      }, QUEUE_TIMEOUT_MS);

      this.queue.push({
        id: queueId,
        resolve,
        timeout,
        addedAt: Date.now(),
      });
    });
  }

  /**
   * Update rate limit state from Discord response headers.
   */
  async updateFromResponse(headers: Record<string, string | null>): Promise<void> {
    const limit = headers['x-ratelimit-limit'];
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];
    const resetAfter = headers['x-ratelimit-reset-after'];
    const bucket = headers['x-ratelimit-bucket'];
    const global = headers['x-ratelimit-global'];
    const scope = headers['x-ratelimit-scope'];

    // Only update if we have meaningful rate limit headers
    if (limit !== null || remaining !== null) {
      if (limit !== null) {
        this.rateLimitState.limit = parseInt(limit, 10);
      }
      if (remaining !== null) {
        this.rateLimitState.remaining = parseInt(remaining, 10);
      }
      if (reset !== null) {
        this.rateLimitState.resetAt = parseFloat(reset);
      }
      if (resetAfter !== null) {
        this.rateLimitState.resetAfter = parseFloat(resetAfter);
      }
      if (bucket !== null) {
        this.rateLimitState.bucket = bucket;
      }
      if (global !== null) {
        this.rateLimitState.isGlobal = global === 'true';
      }
      if (scope !== null) {
        this.rateLimitState.scope = scope;
      }
      this.rateLimitState.lastUpdated = Date.now();
    }

    // Process queue in case slots opened up
    this.processQueue();
  }

  /**
   * Release a slot after a request completes.
   */
  async releaseSlot(): Promise<void> {
    if (this.activeRequests > 0) {
      this.activeRequests--;
    }

    // Process queue in case slots opened up
    this.processQueue();
  }

  /**
   * Handle a 429 rate limit response from Discord.
   * Updates state to reflect the rate limit and calculates retry time.
   */
  async handleRateLimited(retryAfterSeconds: number): Promise<void> {
    const now = Date.now();
    this.rateLimitState.remaining = 0;
    this.rateLimitState.resetAt = (now / 1000) + retryAfterSeconds;
    this.rateLimitState.resetAfter = retryAfterSeconds;
    this.rateLimitState.lastUpdated = now;
  }

  /**
   * Get current rate limit state for debugging/monitoring.
   */
  async getState(): Promise<RateLimitState & { queueLength: number; activeRequests: number }> {
    return {
      ...this.rateLimitState,
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
    };
  }
}
