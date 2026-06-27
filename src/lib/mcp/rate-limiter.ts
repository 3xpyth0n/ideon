/**
 * Sliding window rate limiter for MCP requests.
 *
 * Tracks request timestamps per API key in memory. Allows up to 60 requests
 * per 60-second sliding window. Provides remaining/reset info for response
 * headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset).
 */

/** Window size in milliseconds (60 seconds) */
export const WINDOW_MS = 60_000;

/** Maximum requests allowed per window */
export const MAX_REQUESTS = 60;

/** Result returned by checkRateLimit */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Unix timestamp (seconds) when the oldest request in the window expires */
  resetAt: number;
  /** Seconds to wait before the next request is allowed (only present when blocked) */
  retryAfter?: number;
}

/**
 * In-memory map of keyId → array of request timestamps (ms).
 * Resets on server restart as per requirement 3.3.
 */
const limitMap = new Map<string, number[]>();

/**
 * Checks the rate limit for a given API key.
 *
 * 1. Gets or creates the timestamps array for the key
 * 2. Prunes timestamps older than WINDOW_MS
 * 3. If count >= MAX_REQUESTS: returns blocked result with retryAfter
 * 4. Otherwise: records the current timestamp and returns allowed result
 */
export function checkRateLimit(keyId: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Get or create entry
  let timestamps = limitMap.get(keyId);
  if (!timestamps) {
    timestamps = [];
    limitMap.set(keyId, timestamps);
  }

  // Prune timestamps older than the window
  const pruned = timestamps.filter((ts) => ts > windowStart);
  limitMap.set(keyId, pruned);

  const count = pruned.length;

  if (count >= MAX_REQUESTS) {
    // Blocked — find when the oldest request in the window will expire
    const oldestInWindow = pruned[0];
    const resetAtMs = oldestInWindow + WINDOW_MS;
    const resetAt = Math.ceil(resetAtMs / 1000);
    const retryAfter = Math.ceil((resetAtMs - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.max(retryAfter, 1),
    };
  }

  // Allowed — record this request
  pruned.push(now);

  // resetAt = when the oldest timestamp in the window will expire
  const oldestInWindow = pruned[0];
  const resetAtMs = oldestInWindow + WINDOW_MS;
  const resetAt = Math.ceil(resetAtMs / 1000);

  return {
    allowed: true,
    remaining: MAX_REQUESTS - count - 1,
    resetAt,
  };
}

/**
 * Resets the rate limiter state (useful for testing).
 */
export function resetRateLimiter(): void {
  limitMap.clear();
}
