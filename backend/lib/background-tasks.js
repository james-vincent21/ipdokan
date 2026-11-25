// Scheduled jobs. With Redis they run in the worker (backend/worker.js) as BullMQ job schedulers, so
// each runs once however many API processes there are. Without Redis, server.js runs them on timers.
import { config } from "../config/env.js";

export const TASKS = {
  // Unpaid orders past their payment window are cancelled.
  "expire-orders": { every: 60 * 1000 },
  // Proxies of supplier orders that were not ready at payment time are fetched again.
  "supplier-deliveries": { every: 30 * 1000 },
  // MyProxyApi plans are loaded into the catalog: at start, then every 6 hours.
  "supplier-sync": { every: 6 * 60 * 60 * 1000 },
};

export async function enabledTasks() {
  const { supplierConfigured } = await import("./myproxyapi.js");
  return Object.keys(TASKS).filter((name) => name !== "supplier-sync" || (config.authEnabled && supplierConfigured()));
}

export async function runTask(name) {
  if (name === "expire-orders") {
    const { expirePendingOrders } = await import("../controllers/store.controller.js");
    return expirePendingOrders();
  }
  if (name === "supplier-deliveries") {
    const { refreshSupplierDeliveries } = await import("../controllers/supplier.controller.js");
    return refreshSupplierDeliveries();
  }
  if (name === "supplier-sync") {
    const { syncSupplierProducts } = await import("../controllers/supplier.controller.js");
    const summary = await syncSupplierProducts();
    const added = summary.reduce((sum, item) => sum + (item.added || 0), 0);
    if (added) console.log(`MyProxyApi sync: ${added} new plan(s) added without a price.`);
    return { added };
  }
  throw new Error(`Unknown task: ${name}`);
}

// Fallback without Redis (local development): timers inside the single API process.
export async function runTasksInProcess() {
  for (const name of await enabledTasks()) {
    const run = () => runTask(name).catch((error) => console.error(`Task ${name} failed:`, error.message));
    run();
    setInterval(run, TASKS[name].every).unref();
  }
}
