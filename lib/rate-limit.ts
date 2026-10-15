import { logSecurityEvent } from "./security-logger";

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // Seconds until window reset
}

interface MemoryWindowRecord {
  timestamps: number[];
}

// In-memory sliding window cache
const memoryStore = new Map<string, MemoryWindowRecord>();

// Cleanup stale memory entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    // Keep only timestamps within the last 10 minutes
    const valid = record.timestamps.filter((ts) => now - ts < 600000);
    if (valid.length === 0) {
      memoryStore.delete(key);
    } else {
      record.timestamps = valid;
    }
  }
}, 60000);

/**
 * Extract client IP address safely from standard headers
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

/**
 * Check rate limit using Upstash Redis if configured, or in-memory sliding window
 */
export async function checkRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = options;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Distributed Rate Limiting via Upstash Redis REST
  if (upstashUrl && upstashToken) {
    try {
      const redisKey = `ratelimit:${key}`;
      const response = await fetch(`${upstashUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["TTL", redisKey],
        ]),
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const results = await response.json();
        const currentCount = results[0]?.result || 1;
        let ttl = results[1]?.result;

        // If key was just created without TTL, set TTL
        if (ttl === -1 || ttl === null) {
          await fetch(`${upstashUrl}/EXPIRE/${redisKey}/${windowSeconds}`, {
            headers: { Authorization: `Bearer ${upstashToken}` },
          }).catch(() => null);
          ttl = windowSeconds;
        }

        const remaining = Math.max(0, limit - currentCount);
        const success = currentCount <= limit;

        return {
          success,
          remaining,
          reset: Math.max(1, ttl || windowSeconds),
        };
      }
    } catch (err) {
      console.error("Distributed rate limiter error, falling back to local memory store:", err);
    }
  }

  // Local in-memory sliding window implementation
  let record = memoryStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    memoryStore.set(key, record);
  }

  // Filter out timestamps outside the active window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldestTimestamp = record.timestamps[0];
    const resetMs = windowMs - (now - oldestTimestamp);
    const reset = Math.max(1, Math.ceil(resetMs / 1000));

    logSecurityEvent("RATE_LIMIT_TRIGGERED", {
      targetId: key,
      reason: `Exceeded ${limit} requests per ${windowSeconds}s`,
    });

    return {
      success: false,
      remaining: 0,
      reset,
    };
  }

  record.timestamps.push(now);
  const remaining = Math.max(0, limit - record.timestamps.length);

  return {
    success: true,
    remaining,
    reset: windowSeconds,
  };
}
