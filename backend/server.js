import { config } from "./config/env.js";
import { connectDatabase } from "./config/database.js";

async function startServer() {
  if (config.authEnabled) {
    await connectDatabase();
    console.log("MongoDB connected. Authentication is enabled.");
    const { dropNotificationExpiry } = await import("./models/notification.model.js");
    await dropNotificationExpiry();
  } else {
    console.log("Authentication is disabled. Configure credentials and set AUTH_ENABLED=true to enable it.");
  }

  const { redisEnabled, waitForRedis } = await import("./lib/redis.js");
  if (redisEnabled) {
    await waitForRedis();
    console.log("Redis connected. Scheduled jobs and emails run in the worker (backend/worker.js).");
  } else {
    // No Redis (local development): scheduled jobs run here on timers.
    const { runTasksInProcess } = await import("./lib/background-tasks.js");
    await runTasksInProcess();
  }

  const { default: app } = await import("./app.js");

  // One HTTP server for the API and Socket.IO (live notifications and cart sync at /api/socket.io).
  const { createServer } = await import("node:http");
  const { initRealtime } = await import("./lib/realtime.js");
  const httpServer = createServer(app);
  initRealtime(httpServer);
  httpServer.listen(config.port, () => {
    console.log(`IP Dokan API listening on http://localhost:${config.port} (Socket.IO at /api/socket.io)`);
  });
}

startServer().catch((error) => {
  console.error("Could not start API:", error.message);
  process.exit(1);
});
