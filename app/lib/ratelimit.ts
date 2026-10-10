import { Pool } from "pg";
import { RateLimiterPostgres } from "rate-limiter-flexible";
import type { UserType } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";

// A "request" = one inbound user message, however many model/tool calls it makes.
const n = (k: string, d: number) => Number(process.env[k] ?? d);
export const limits: Record<UserType, { perMinute: number; perDay: number }> = {
  admin: { perDay: n("RATE_ADMIN_DAY", 1000), perMinute: n("RATE_ADMIN_MIN", 30) },
  guest: { perDay: n("RATE_GUEST_DAY", 5), perMinute: n("RATE_GUEST_MIN", 2) },
  user: { perDay: n("RATE_USER_DAY", 50), perMinute: n("RATE_USER_MIN", 5) },
};
export const REQUEST_TIME_BUDGET_MS = n("REQUEST_TIME_BUDGET_MS", 120_000);
export const MAX_MODEL_STEPS = n("MAX_MODEL_STEPS", 10);
const GUESTS_PER_IP_HOUR = n("RATE_GUESTS_PER_IP_HOUR", 10);

let pool: Pool | undefined;
const cache = new Map<string, RateLimiterPostgres>();
function limiter(prefix: string, points: number, duration: number) {
  const key = `${prefix}:${points}:${duration}`;
  let l = cache.get(key);
  if (!l) {
    pool ??= new Pool({ connectionString: process.env.POSTGRES_URL_ADMIN });
    l = new RateLimiterPostgres({
      duration,
      keyPrefix: prefix,
      points,
      storeClient: pool,
      tableCreated: true,
      tableName: "rate_limits",
    });
    cache.set(key, l);
  }
  return l;
}

export class RateLimitedError extends ChatbotError {
  retryAfterSec: number;
  constructor(retryAfterSec: number, scope: "minute" | "day" | "ip") {
    super("rate_limit:chat");
    this.retryAfterSec = Math.max(1, retryAfterSec);
    this.message =
      scope === "minute"
        ? "You're sending messages too quickly. Please wait a moment."
        : scope === "day"
          ? "You've reached today's message limit. Please come back tomorrow, or sign in with a verified account for a higher limit."
          : "Too many sessions from your network. Please try again later.";
  }
}

async function take(l: RateLimiterPostgres, key: string, scope: "minute" | "day" | "ip") {
  try {
    await l.consume(key, 1);
  } catch (e) {
    if (e && typeof e === "object" && "msBeforeNext" in e) {
      throw new RateLimitedError(Math.ceil(Number(e.msBeforeNext) / 1000), scope);
    }
    throw e; // storage failure: fail closed (surfaced as 5xx)
  }
}

/** Charge one request against the per-minute then per-day budgets. */
export async function consumeRequest(userId: string, type: UserType) {
  const cfg = limits[type];
  await take(limiter("min", cfg.perMinute, 60), userId, "minute");
  await take(limiter("day", cfg.perDay, 86_400), userId, "day");
}

/** Cap how many anonymous guest sessions one IP can create. */
export async function consumeGuestSession(ip: string) {
  await take(limiter("guestip", GUESTS_PER_IP_HOUR, 3600), ip, "ip");
}
