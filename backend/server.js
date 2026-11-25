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
  // Proxies of supplier orders that were not ready at payment time are fetched again here.
  const { refreshSupplierDeliveries, syncSupplierProducts } = await import("./controllers/supplier.controller.js");
  const { supplierConfigured } = await import("./lib/myproxyapi.js");
  // MyProxyApi plans are loaded into the catalog automatically: at start, then every 6 hours.
  if (config.authEnabled && supplierConfigured()) {
    const syncProducts = () => syncSupplierProducts().then((summary) => {
      const added = summary.reduce((sum, item) => sum + (item.added || 0), 0);
      if (added) console.log(`MyProxyApi sync: ${added} new plan(s) added without a price.`);
    }).catch((error) => console.error("MyProxyApi product sync failed:", error.message));
    syncProducts();
    setInterval(syncProducts, 6 * 60 * 60 * 1000).unref();
  }
  setInterval(() => {
    refreshSupplierDeliveries().catch((error) => console.error("Could not refresh supplier deliveries:", error.message));
  }, 30 * 1000).unref();

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
