// Redis (runs in Docker next to the app: deploy/docker-compose.yml). Used for:
//   - Better Auth secondary storage: sessions, sign-up OTP codes and auth rate limits
//   - BullMQ queues (backend/worker.js)
//   - Socket.IO adapter, so every API process (pm2 cluster) and the worker reach every open tab
// Without REDIS_URL (local development) everything falls back to the old single-process behaviour.
import { Redis } from "ioredis";
import { config } from "../config/env.js";

export const redisEnabled = Boolean(config.redisUrl);

// Separate connections per job: BullMQ workers and the Socket.IO subscriber block their connection.
export function createRedis(options = {}) {
  if (!redisEnabled) return null;
  const client = new Redis(config.redisUrl, { lazyConnect: false, ...options });
  client.on("error", (error) => {
    if (!client.lastLoggedError || Date.now() - client.lastLoggedError > 30_000) {
      client.lastLoggedError = Date.now();
      console.error("Redis:", error.message);
    }
  });
  return client;
}

// BullMQ requires maxRetriesPerRequest: null on its connections.
export const createQueueConnection = () => createRedis({ maxRetriesPerRequest: null });

// Commands fail fast while Redis is down instead of waiting in a queue, so a Redis outage never hangs
// a page: sessions are read from MongoDB instead (storeSessionInDatabase stays on).
export const redis = createRedis({ enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 5000 });

export async function waitForRedis(client = redis, timeoutMs = 10_000) {
  if (!client || client.status === "ready") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis did not become ready in time.")), timeoutMs);
    client.once("ready", () => { clearTimeout(timer); resolve(); });
  });
}

const PREFIX = "auth:";
// Better Auth secondary storage. Reads never throw: a missing value makes Better Auth fall back to
// MongoDB for sessions, so signed-in users stay signed in if Redis restarts.
export const authStorage = redis ? {
  async get(key) {
    try { return await redis.get(PREFIX + key); } catch { return null; }
  },
  async getAndDelete(key) {
    try { return await redis.getdel(PREFIX + key); } catch { return null; }
  },
  async set(key, value, ttl) {
    if (ttl) await redis.set(PREFIX + key, value, "EX", Math.max(1, Math.ceil(ttl)));
    else await redis.set(PREFIX + key, value);
  },
  async delete(key) {
    try { await redis.del(PREFIX + key); } catch { /* expires by itself */ }
  },
  // Rate limit counter: created with the TTL, later increments keep it. Fails open if Redis is down.
  async increment(key, ttl) {
    try {
      const [[, count]] = await redis.multi().incr(PREFIX + key).expire(PREFIX + key, Math.max(1, Math.ceil(ttl)), "NX").exec();
      return Number(count);
    } catch { return 0; }
  },
} : undefined;
