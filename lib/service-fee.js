// Mirrors backend/utils/service-fee.js so the checkout shows exactly what the payment gateway charges.
// The percent comes from the API (/api/payments/mode or /api/proxies); 5 is only the fallback while it loads.
export const DEFAULT_SERVICE_FEE_PERCENT = 5;

const roundMoney = (value) => Math.round(value * 100) / 100;

export function withServiceFee(subtotal, percent = DEFAULT_SERVICE_FEE_PERCENT) {
  const base = roundMoney(Number(subtotal) || 0);
  const serviceFee = roundMoney(base * percent / 100);
  return { subtotal: base, serviceFee, total: roundMoney(base + serviceFee) };
}

// Each cart line becomes its own order with its own rounded fee, so the cart total is summed per line.
export function sumWithServiceFee(lineSubtotals, percent = DEFAULT_SERVICE_FEE_PERCENT) {
  return lineSubtotals.reduce((sum, value) => {
    const line = withServiceFee(value, percent);
    return { subtotal: roundMoney(sum.subtotal + line.subtotal), serviceFee: roundMoney(sum.serviceFee + line.serviceFee), total: roundMoney(sum.total + line.total) };
  }, { subtotal: 0, serviceFee: 0, total: 0 });
}
