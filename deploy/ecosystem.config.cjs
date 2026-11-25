// pm2 process file. PUBLIC_URL is the address people use to open the site.
// The live site is served at the domain (nginx + HTTPS); the bare IP must not be used for the build or CORS.
const PUBLIC_URL = process.env.PUBLIC_URL || "https://ipdokan.com";

const shared = {
  NODE_ENV: "production",
  FRONTEND_ORIGIN: PUBLIC_URL,
  BETTER_AUTH_URL: PUBLIC_URL,
  API_RESOURCE: `${PUBLIC_URL}/api`,
  NEXT_PUBLIC_API_URL: PUBLIC_URL,
};

// The VPS has 6 cores: 3 API processes + 2 Next.js processes + 1 worker, leaving room for Redis,
// MongoDB traffic and the other services (ipdokan-server, ipdokan-bot).
// Cluster mode needs Redis (REDIS_URL in .env): sessions, Socket.IO rooms and scheduled jobs are shared
// through it, and scheduled jobs run only in the worker.
module.exports = {
  apps: [
    {
      name: "ipdokan-api",
      cwd: "/var/www/ipdokan",
      script: "backend/server.js",
      exec_mode: "cluster",
      instances: 3,
      max_memory_restart: "600M",
      kill_timeout: 5000,
      env: { ...shared, API_PORT: "4000" },
    },
    {
      name: "ipdokan-web",
      cwd: "/var/www/ipdokan",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      exec_mode: "cluster",
      instances: 2,
      max_memory_restart: "800M",
      env: shared,
    },
    {
      name: "ipdokan-worker",
      cwd: "/var/www/ipdokan",
      script: "backend/worker.js",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "400M",
      kill_timeout: 10000,
      env: shared,
    },
  ],
};
