function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

export function downloadInvoicePdf(order, customer = {}) {
  if (typeof window === "undefined") return false;
  const invoiceWindow = window.open("", "_blank");
  if (!invoiceWindow) return false;
  invoiceWindow.opener = null;
  const orderId = String(order.id || order._id || "");
  const date = new Date(order.createdAt || Date.now());
  const datePart = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  const invoiceId = order.invoiceId || `IPD-${datePart}-${orderId.toUpperCase()}`;
  const customerName = customer.name || order.userName || "Customer";
  const customerEmail = customer.email || order.userEmail || "";
  const description = `${order.productName}${order.variantName ? ` — ${order.variantName}` : ""}`;
  const invoiceDate = new Date(order.paidAt || order.createdAt || Date.now()).toLocaleString();
  let amount;
  try { amount = new Intl.NumberFormat(undefined, { style: "currency", currency: order.currency || "USD" }).format(order.amount); }
  catch { amount = `${order.currency || "USD"} ${Number(order.amount || 0).toFixed(2)}`; }
  invoiceWindow.document.open();
  invoiceWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(invoiceId)}</title><style>
    @page{size:A4;margin:20mm}*{box-sizing:border-box}body{font:15px Arial,sans-serif;color:#172033;margin:0}.invoice{max-width:760px;margin:32px auto;padding:36px;border:1px solid #dce2eb;border-radius:12px}.top{display:flex;justify-content:space-between;align-items:flex-start;background:#101c3b;color:#fff;border-radius:10px;padding:24px}.logo{width:180px;height:auto}.title{text-align:right}.title h1{margin:0 0 8px;font-size:30px}.muted{color:#667085;font-size:13px}.top .muted{color:#d0dcf4}.meta{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:26px 0}.meta strong,.meta span{display:block;margin-bottom:6px}table{width:100%;border-collapse:collapse;margin:14px 0 22px}th,td{text-align:left;padding:14px;border-bottom:1px solid #e4e8ef}th{font-size:12px;color:#667085;text-transform:uppercase}td:last-child,th:last-child{text-align:right}.total{display:flex;justify-content:space-between;border-top:2px solid #172033;padding-top:18px;font-size:19px;font-weight:bold}.footer{margin-top:36px;border-top:1px solid #e4e8ef;padding-top:18px;color:#667085;font-size:12px}@media print{body{print-color-adjust:exact}.invoice{border:0;margin:0;padding:0;max-width:none}}
    </style></head><body><main class="invoice"><header class="top"><img class="logo" src="${window.location.origin}/ip-dokan-logo.svg" alt="IP Dokan"><div class="title"><h1>Invoice</h1><div class="muted">${escapeHtml(invoiceId)}</div></div></header><section class="meta"><div><strong>Bill to</strong><span>${escapeHtml(customerName)}</span><span class="muted">${escapeHtml(customerEmail)}</span></div><div><strong>Order ID</strong><span>${escapeHtml(orderId)}</span><strong style="margin-top:12px">Invoice date</strong><span>${escapeHtml(invoiceDate)}</span></div></section><table><thead><tr><th>Product</th><th>Qty</th><th>Payment</th></tr></thead><tbody><tr><td>${escapeHtml(description)}</td><td>${Number(order.quantity || 1)}</td><td>${escapeHtml(amount)}</td></tr></tbody></table><div class="total"><span>Total paid</span><span>${escapeHtml(amount)}</span></div><footer class="footer">Payment method: ${escapeHtml(order.paymentMethod || "Online payment")} · Status: Paid<br>Thank you for your purchase.</footer></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300))</script></body></html>`);
  invoiceWindow.document.close();
  invoiceWindow.focus();
  return true;
}
