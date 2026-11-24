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

module.exports = {
  apps: [
    {
      name: "ipdokan-api",
      cwd: "/var/www/ipdokan",
      script: "backend/server.js",
      env: { ...shared, API_PORT: "4000" },
    },
    {
      name: "ipdokan-web",
      cwd: "/var/www/ipdokan",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      env: shared,
    },
  ],
};
