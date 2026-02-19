import { RateLimiterPostgres, RateLimiterMemory } from "rate-limiter-flexible";
import { Pool } from "pg";
import { headers } from "next/headers";
import { getClientIp } from "@lib/security-utils";

// Use a single pool instance for rate limiting if we are using Postgres
let pgPool: Pool | undefined;

if (process.env.DATABASE_URL) {
  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5, // Keep connection count low for rate limiting
    });
  } catch (error) {
    console.warn(
      "Failed to initialize Postgres pool for rate limiting, falling back to memory",
      error,
    );
  }
}

interface RateLimitOptions {
  keyPrefix: string;
  points: number; // Number of points
  duration: number; // Per second(s)
}

const limiters = new Map<string, RateLimiterPostgres | RateLimiterMemory>();

function getLimiter(options: RateLimitOptions) {
  const { keyPrefix, points, duration } = options;
  const mapKey = `${keyPrefix}:${points}:${duration}`;

  if (limiters.has(mapKey)) {
    return limiters.get(mapKey)!;
  }

  let limiter: RateLimiterPostgres | RateLimiterMemory;

  if (pgPool) {
    limiter = new RateLimiterPostgres({
      storeClient: pgPool,
      keyPrefix,
      points,
      duration,
      tableName: "rateLimits",
    });
  } else {
    limiter = new RateLimiterMemory({
      keyPrefix,
      points,
      duration,
    });
  }

  limiters.set(mapKey, limiter);
  return limiter;
}

export async function checkRateLimit(
  actionName: string,
  limit: number = 5,
  windowInSeconds: number = 60,
  uniqueToken?: string,
) {
  let key = uniqueToken;

  if (!key) {
    const headersList = await headers();
    key = getClientIp(headersList);
  }

  const limiter = getLimiter({
    keyPrefix: actionName,
    points: limit,
    duration: windowInSeconds,
  });

  try {
    await limiter.consume(key);
  } catch {
    throw {
      status: 429,
      message: "Too many requests, please try again later.",
    };
  }
}
