// Background worker (pm2 process "ipdokan-worker"; exactly one instance). Runs BullMQ jobs from Redis:
//   "email"  OTP emails, retried with back-off
//   "tasks"  scheduled jobs from lib/background-tasks.js (expire orders, supplier deliveries, plan sync)
// Notifications it creates reach open tabs through Redis (Socket.IO emitter → API processes).
import { Worker, Queue } from "bullmq";
import { config } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { createQueueConnection, redisEnabled, waitForRedis, redis } from "./lib/redis.js";
import { EMAIL_QUEUE, TASK_QUEUE } from "./lib/queue.js";
import { TASKS, enabledTasks, runTask } from "./lib/background-tasks.js";
import { sendMail } from "./lib/mailer.js";

async function start() {
  if (!redisEnabled) throw new Error("The worker needs REDIS_URL.");
  await waitForRedis(redis);
  if (config.authEnabled) await connectDatabase();
  // Loaded after MongoDB connects: it pulls in the auth setup, which needs the database client.
  const { initRealtimeEmitter } = await import("./lib/realtime.js");
  initRealtimeEmitter();

  const emailWorker = new Worker(EMAIL_QUEUE, async (job) => sendMail(job.data), {
    connection: createQueueConnection(),
    concurrency: 5,
    // Gmail allows a few hundred messages a day; stay well under its per-second limits.
    limiter: { max: 10, duration: 1000 },
  });

  const taskQueue = new Queue(TASK_QUEUE, { connection: createQueueConnection() });
  const enabled = await enabledTasks();
  for (const name of Object.keys(TASKS)) {
    if (enabled.includes(name)) {
      await taskQueue.upsertJobScheduler(name, { every: TASKS[name].every }, {
        name, opts: { removeOnComplete: 100, removeOnFail: 500 },
      });
    } else await taskQueue.removeJobScheduler(name);
  }
  // One task at a time, so two runs of the same job never overlap.
  const taskWorker = new Worker(TASK_QUEUE, (job) => runTask(job.name), { connection: createQueueConnection(), concurrency: 1 });

  for (const [label, worker] of [["email", emailWorker], ["tasks", taskWorker]]) {
    worker.on("failed", (job, error) => console.error(`${label} job ${job?.name} failed (attempt ${job?.attemptsMade}):`, error.message));
    worker.on("error", (error) => console.error(`${label} worker:`, error.message));
  }
  console.log(`Worker ready: email queue, tasks: ${enabled.join(", ")}`);

  const stop = async () => {
    await Promise.allSettled([emailWorker.close(), taskWorker.close(), taskQueue.close()]);
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

start().catch((error) => {
  console.error("Worker could not start:", error.message);
  process.exit(1);
});
