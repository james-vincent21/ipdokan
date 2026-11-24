// Sets the selling prices of the API proxy plans (1 month) from the price list.
//   node backend/scripts/set-proxy-prices.js                 # USD from the list, BDT = USD × 135
//   node backend/scripts/set-proxy-prices.js --rate 140      # change the BDT rate later
//   node backend/scripts/set-proxy-prices.js --dry-run       # show what would change, save nothing
// These are product prices; the service fee (SERVICE_FEE_PERCENT, default 5%) is added at checkout.
// Re-running overwrites every listed plan's USD and BDT price, including prices edited in admin.
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Product } from "../models/product.model.js";
import { ProductActivity } from "../models/product-activity.model.js";
import { lowestSetPrice } from "../controllers/supplier.controller.js";

// Supplier category → { number of IPs: USD price for 1 month }.
const PRICE_LIST = {
  datacenter: { 1: 3.99, 3: 10.99, 5: 15.99, 10: 25.99, 20: 49.99, 50: 99.99, 100: 189.99, 150: 269.99, 200: 359.99, 500: 799.99, 1000: 1399.99 },
  "static-residential": { 1: 9.99, 3: 26.99, 5: 39.99, 10: 69.99, 20: 119.99, 50: 249.99, 100: 449.99, 150: 599.99, 200: 799.99, 500: 1749.99, 1000: 2999.99 },
  isp: { 1: 5.99, 3: 14.99, 5: 24.99, 10: 39.99, 20: 74.99, 50: 149.99, 100: 279.99, 150: 399.99, 200: 499.99, 500: 999.99, 1000: 1799.99 },
  "premium-isp": { 1: 7.99, 3: 20.99, 5: 29.99, 10: 54.99, 20: 99.99, 50: 224.99, 100: 399.99, 150: 549.99, 200: 699.99, 500: 1499.99, 1000: 2699.99 },
};
const PERIOD = "1";

function parseArgs(argv) {
  const args = { rate: 135, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") args.dryRun = true;
    else if (argv[index] === "--rate") args.rate = Number(argv[++index]);
    else if (argv[index].startsWith("--rate=")) args.rate = Number(argv[index].slice(7));
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  if (!Number.isFinite(args.rate) || args.rate <= 0) throw new Error("--rate must be a positive number of BDT per 1 USD.");
  return args;
}

async function main() {
  const { rate, dryRun } = parseArgs(process.argv.slice(2));
  await connectDatabase();
  console.log(`${dryRun ? "[dry run] " : ""}Database: ${mongoose.connection.name} · 1 USD = ${rate} BDT\n`);
  let changed = 0;
  for (const [slug, prices] of Object.entries(PRICE_LIST)) {
    const product = await Product.findOne({ source: "myproxyapi", supplierCategory: slug });
    if (!product) { console.log(`! ${slug}: product not found. Run "Sync API products" in admin first.`); continue; }
    console.log(`# ${product.name}`);
    const seen = new Set();
    for (const variant of product.variants) {
      const ips = variant.supplier?.ips;
      if (variant.supplier?.period !== PERIOD || !Object.hasOwn(prices, ips)) continue;
      seen.add(ips);
      const priceUsd = prices[ips];
      const priceBdt = Math.round(priceUsd * rate);
      const cost = Number(variant.supplier?.costUsd) || 0;
      const warning = cost > priceUsd ? `  ⚠ below supplier cost $${cost.toFixed(2)}, this plan will not sell` : "";
      const same = variant.priceUsd === priceUsd && variant.priceBdt === priceBdt;
      console.log(`  ${String(ips).padStart(4)} IPs  $${variant.priceUsd || 0} → $${priceUsd}   ৳${variant.priceBdt || 0} → ৳${priceBdt}${same ? "  (unchanged)" : ""}${warning}`);
      if (same) continue;
      Object.assign(variant, { price: priceUsd, priceUsd, priceBdt });
      changed += 1;
    }
    const missing = Object.keys(prices).map(Number).filter((ips) => !seen.has(ips));
    if (missing.length) console.log(`  ! No ${PERIOD}-month plan for ${missing.join(", ")} IPs in the store; those prices were skipped.`);
    const lowestUsd = lowestSetPrice(product.variants, "priceUsd");
    Object.assign(product, { price: lowestUsd, priceUsd: lowestUsd, priceBdt: lowestSetPrice(product.variants, "priceBdt") });
    if (!dryRun && product.isModified()) {
      await product.save();
      await ProductActivity.create({ productId: String(product._id), productName: product.name, action: "edited", adminEmail: "price-script", details: `Plan prices set from the price list (1 USD = ${rate} BDT)` });
    }
  }
  console.log(`\n${dryRun ? "Would change" : "Changed"} ${changed} plan price(s).`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
