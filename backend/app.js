import express from "express";
import { toNodeHandler } from "better-auth/node";
import { config } from "./config/env.js";
import { auth } from "./lib/auth.js";
import profileRoutes from "./routes/profile.routes.js";
import storeRoutes from "./routes/store.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { stripeWebhook } from "./controllers/store.controller.js";
import { zinipayWebhook } from "./controllers/zinipay.controller.js";
import { cryptomusWebhook } from "./controllers/cryptomus.controller.js";

const app = express();

app.disable("x-powered-by");
// nginx on the same machine passes the visitor's address in X-Forwarded-For.
app.set("trust proxy", "loopback");
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === config.frontendOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin === config.frontendOrigin ? 204 : 403);
  next();
});

app.get("/api/health", (_req, res) => res.json({ status: "ok", authEnabled: config.authEnabled }));

if (auth) {
  const authHandler = toNodeHandler(auth);
  app.all("/api/auth", authHandler);
  app.all("/api/auth/*splat", authHandler);
} else {
  app.use("/api/auth", (_req, res) => res.status(503).json({ error: "Authentication is not enabled yet. Configure the backend credentials to continue." }));
}

app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);
// ZiniPay may send the callback as JSON, as a form, or as query parameters.
app.all("/api/payments/zinipay/webhook", express.json({ limit: "16kb" }), express.urlencoded({ extended: false, limit: "16kb" }), zinipayWebhook);
app.post("/api/payments/cryptomus/webhook", express.json({ limit: "64kb" }), cryptomusWebhook);

// Better Auth needs the raw request stream, so JSON parsing is applied after its handler.
app.use(express.json({ limit: "16kb" }));
app.use("/api/profile", profileRoutes);
app.use("/api", storeRoutes);
app.use("/api/admin", adminRoutes);
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

export default app;
