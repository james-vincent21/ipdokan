"use client";

export const datePresets = [
  ["all", "All time"],
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["month", "This month"],
  ["lastMonth", "Last month"],
  ["custom", "Custom date"],
];

export const defaultOrderFilter = { query: "", variant: "", date: "all", from: "", to: "" };

const DAY_MS = 86400000;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const parseDay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};
const variantKey = (productName, variantName) => `${productName || ""}\u0000${variantName || ""}`;

export const isFilterActive = (filter) => Boolean(filter.query.trim() || filter.variant || filter.date !== "all");

// Returns a local-time [start, end) range; either side may be null (open-ended).
export function getDateRange(filter, now = new Date()) {
  const today = startOfDay(now);
  switch (filter.date) {
    case "today": return { start: today, end: addDays(today, 1) };
    case "yesterday": return { start: addDays(today, -1), end: today };
    case "7d": return { start: addDays(today, -6), end: addDays(today, 1) };
    case "30d": return { start: addDays(today, -29), end: addDays(today, 1) };
    case "month": return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1) };
    case "lastMonth": return { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: new Date(today.getFullYear(), today.getMonth(), 1) };
    case "custom": {
      let start = parseDay(filter.from);
      let end = parseDay(filter.to);
      if (start && end && start > end) [start, end] = [end, start];
      return { start, end: end ? addDays(end, 1) : null };
    }
    default: return { start: null, end: null };
  }
}

export function variantOptions(orders, products) {
  const options = new Map();
  for (const product of products) for (const variant of product.variants || []) options.set(variantKey(product.name, variant.name), `${product.name} — ${variant.name}`);
  for (const order of orders) if (order.variantName) options.set(variantKey(order.productName, order.variantName), `${order.productName} — ${order.variantName}`);
  return [...options].sort((a, b) => a[1].localeCompare(b[1]));
}

export function filterOrders(orders, filter) {
  const query = filter.query.trim().toLowerCase();
  const { start, end } = getDateRange(filter);
  return orders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    if (start && createdAt < start) return false;
    if (end && createdAt >= end) return false;
    if (filter.variant && variantKey(order.productName, order.variantName) !== filter.variant) return false;
    if (query && ![order.productName, order.variantName, order.userName, order.userEmail, order.invoiceId, order._id].some((value) => String(value || "").toLowerCase().includes(query))) return false;
    return true;
  });
}

export function summarizeOrders(orders) {
  const summary = { orders: orders.length, paidUnits: 0, pending: 0, revenue: { USD: 0, BDT: 0 } };
  for (const order of orders) {
    if (order.status === "pending") summary.pending += 1;
    if (order.status !== "paid") continue;
    summary.paidUnits += order.quantity || 1;
    const currency = order.currency === "BDT" ? "BDT" : "USD";
    summary.revenue[currency] += Number(order.amount) || 0;
  }
  return summary;
}

// Paid revenue in one currency, bucketed by day for ranges up to ~2 months, otherwise by month.
export function buildRevenueChart(orders, filter, currency) {
  const now = new Date();
  const paid = orders.filter((order) => order.status === "paid" && (order.currency === "BDT" ? "BDT" : "USD") === currency);
  let { start, end } = getDateRange(filter, now);
  if (!end) end = addDays(startOfDay(now), 1);
  if (!start) {
    const sixMonthsAgo = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    const earliest = paid.reduce((min, order) => { const date = new Date(order.createdAt); return date < min ? date : min; }, sixMonthsAgo);
    start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  }
  const daily = (end - start) / DAY_MS <= 62;
  const spansYears = start.getFullYear() !== addDays(end, -1).getFullYear();
  const keyOf = (date) => daily ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : `${date.getFullYear()}-${date.getMonth()}`;
  const buckets = [];
  const index = new Map();
  for (let date = daily ? new Date(start) : new Date(start.getFullYear(), start.getMonth(), 1); date < end; date = daily ? addDays(date, 1) : new Date(date.getFullYear(), date.getMonth() + 1, 1)) {
    const label = daily
      ? date.toLocaleString("en", { month: "short", day: "numeric" })
      : date.toLocaleString("en", spansYears ? { month: "short", year: "2-digit" } : { month: "short" });
    index.set(keyOf(date), buckets.length);
    buckets.push({ label, revenue: 0, orders: 0 });
  }
  for (const order of paid) {
    const bucket = buckets[index.get(keyOf(new Date(order.createdAt)))];
    if (!bucket) continue;
    bucket.revenue += Number(order.amount) || 0;
    bucket.orders += 1;
  }
  return { data: buckets.map((bucket) => ({ ...bucket, revenue: Math.round(bucket.revenue * 100) / 100 })), daily };
}

export function OrderFilterBar({ filter, onChange, variants, total, shown }) {
  const set = (patch) => onChange({ ...filter, ...patch });
  return <section className="admin-filter-bar" aria-label="Filter orders">
    <label className="admin-filter-search">Name<input type="search" placeholder="Product, customer, email or invoice" value={filter.query} onChange={(event) => set({ query: event.target.value })} /></label>
    <label>Variant<select value={filter.variant} onChange={(event) => set({ variant: event.target.value })}><option value="">All variants</option>{variants.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Date<select value={filter.date} onChange={(event) => set({ date: event.target.value })}>{datePresets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {filter.date === "custom" && <div className="admin-filter-custom">
      <label>From<input type="date" value={filter.from} max={filter.to || undefined} onChange={(event) => set({ from: event.target.value })} /></label>
      <label>To<input type="date" value={filter.to} min={filter.from || undefined} onChange={(event) => set({ to: event.target.value })} /></label>
    </div>}
    <div className="admin-filter-summary">
      <span>Showing {shown} of {total} orders</span>
      {isFilterActive(filter) && <button type="button" className="admin-secondary" onClick={() => onChange(defaultOrderFilter)}>Clear filters</button>}
    </div>
  </section>;
}
