import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  resetRateLimiter,
  WINDOW_MS,
  MAX_REQUESTS,
} from "./rate-limiter";

describe("rate-limiter", () => {
  beforeEach(() => {
    resetRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports correct constants", () => {
    expect(WINDOW_MS).toBe(60_000);
    expect(MAX_REQUESTS).toBe(60);
  });

  it("allows the first request", () => {
    const result = checkRateLimit("key-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
    expect(result.retryAfter).toBeUndefined();
  });

  it("allows up to 60 requests in the window", () => {
    for (let i = 0; i < 60; i++) {
      const result = checkRateLimit("key-2");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59 - i);
    }
  });

  it("blocks the 61st request with retryAfter", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-3");
    }

    const result = checkRateLimit("key-3");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it("provides resetAt as a Unix timestamp in seconds", () => {
    const result = checkRateLimit("key-4");
    expect(result.resetAt).toBeGreaterThan(Date.now() / 1000 - 1);
    expect(result.resetAt).toBeLessThanOrEqual(
      Math.ceil((Date.now() + WINDOW_MS) / 1000),
    );
  });

  it("prunes old timestamps and allows new requests after window expires", () => {
    // Fill up the limit
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-5");
    }

    // Blocked
    expect(checkRateLimit("key-5").allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(WINDOW_MS + 1);

    // Should be allowed again
    const result = checkRateLimit("key-5");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it("sliding window allows requests as old ones expire", () => {
    // Make 60 requests at t=0
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-6");
    }

    // Blocked at t=0
    expect(checkRateLimit("key-6").allowed).toBe(false);

    // Advance 30 seconds — half the window, no timestamps have expired yet
    // since all were created at the same instant
    vi.advanceTimersByTime(30_000);
    expect(checkRateLimit("key-6").allowed).toBe(false);

    // Advance to just past the window (total 60001ms from start)
    vi.advanceTimersByTime(30_001);

    // All original timestamps should now be pruned (they were all at t=0)
    const result = checkRateLimit("key-6");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it("tracks separate limits for different keys", () => {
    // Fill up key-a
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-a");
    }

    // key-a is blocked
    expect(checkRateLimit("key-a").allowed).toBe(false);

    // key-b should still be allowed
    const result = checkRateLimit("key-b");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it("retryAfter is at least 1 second", () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit("key-7");
    }

    const result = checkRateLimit("key-7");
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });
});
