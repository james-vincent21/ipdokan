import { config } from "../config/env.js";

const roundMoney = (value) => Math.round(value * 100) / 100;

// Service + additional fee added on top of every order's product price. The customer pays `total`.
// The same rounding runs in lib/service-fee.js so the checkout shows exactly what the gateway charges.
export function withServiceFee(subtotal, percent = config.serviceFeePercent) {
  const base = roundMoney(subtotal);
  const serviceFee = roundMoney(base * percent / 100);
  return { subtotal: base, serviceFee, total: roundMoney(base + serviceFee) };
}
