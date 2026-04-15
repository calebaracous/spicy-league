import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

const ALLOW: RateLimitResult = {
  success: true,
  limit: Infinity,
  remaining: Infinity,
  reset: Date.now(),
};

type RateLimitSpec = {
  name: string;
  tokens: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
};

export const rateLimits = {
  magicLink: {
    name: "rl:magic-link",
    tokens: 3,
    window: "1 h",
  },
  statRefresh: {
    name: "rl:stat-refresh",
    tokens: 1,
    window: "1 h",
  },
} as const satisfies Record<string, RateLimitSpec>;

const limiters = new Map<string, Ratelimit>();

function getLimiter(spec: RateLimitSpec): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  const cached = limiters.get(spec.name);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(spec.tokens, spec.window),
    prefix: spec.name,
    analytics: false,
  });
  limiters.set(spec.name, limiter);
  return limiter;
}

export async function checkRateLimit(
  spec: RateLimitSpec,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(spec);
  if (!limiter) return ALLOW;
  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}
