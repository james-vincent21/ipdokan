import { config } from "./config/env.js";
import { connectDatabase } from "./config/database.js";

async function startServer() {
  if (config.authEnabled) {
    await connectDatabase();
    console.log("MongoDB connected. Authentication is enabled.");
  } else {
    console.log("Authentication is disabled. Configure credentials and set AUTH_ENABLED=true to enable it.");
  }

  const { default: app } = await import("./app.js");
  const { expirePendingOrders } = await import("./controllers/store.controller.js");
  expirePendingOrders().catch((error) => console.error("Could not expire pending orders:", error.message));
  setInterval(() => {
    expirePendingOrders().catch((error) => console.error("Could not expire pending orders:", error.message));
  }, 60 * 1000).unref();

  app.listen(config.port, () => {
    console.log(`IP Dokan API listening on http://localhost:${config.port}`);
  });
}

startServer().catch((error) => {
  console.error("Could not start API:", error.message);
  process.exit(1);
});
