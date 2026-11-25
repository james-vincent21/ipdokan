import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";
import { confirmZinipayPayment, createZinipayInvoice } from "../controllers/zinipay.controller.js";
import { confirmCryptomusPayment, createCryptomusInvoice } from "../controllers/cryptomus.controller.js";
import { listProxyStore } from "../controllers/supplier.controller.js";
import { getSiteStatus } from "../controllers/site-status.controller.js";
import { confirmTopup, createTopup, getWallet, getWalletBalance, payWithWallet } from "../controllers/wallet.controller.js";
import { listNotifications, markNotificationsRead, setNotificationRead } from "../lib/realtime.js";
import { addProductReview, completeDemoPayment, createOrder, createStripeCheckout, listMyOrders, listProductReviews, listProducts, paymentMode, toggleProductReviewLike } from "../controllers/store.controller.js";

const router = Router();
router.get("/site-status", getSiteStatus);
router.get("/products", listProducts);
router.get("/proxies", listProxyStore);
router.get("/payments/mode", paymentMode);
router.get("/products/:id/reviews", optionalAuth, listProductReviews);
router.post("/products/:id/reviews", requireAuth, addProductReview);
router.post("/products/:id/reviews/:reviewId/like", requireAuth, toggleProductReviewLike);
router.use("/orders", requireAuth);
router.get("/orders", listMyOrders);
router.post("/orders", createOrder);
router.post("/payments/stripe/session", requireAuth, createStripeCheckout);
router.post("/payments/demo/complete", requireAuth, completeDemoPayment);
router.post("/payments/zinipay/create", requireAuth, createZinipayInvoice);
router.post("/payments/zinipay/confirm", requireAuth, confirmZinipayPayment);
router.post("/payments/cryptomus/create", requireAuth, createCryptomusInvoice);
router.post("/payments/cryptomus/confirm", requireAuth, confirmCryptomusPayment);
router.post("/payments/wallet/create", requireAuth, payWithWallet);
router.get("/wallet", requireAuth, getWallet);
router.get("/wallet/balance", requireAuth, getWalletBalance);
router.post("/wallet/topups", requireAuth, createTopup);
router.post("/wallet/topups/:id/confirm", requireAuth, confirmTopup);
// Notifications: newest first with the unread count (?before=<date> for older ones, ?unread=1 for unread only).
router.get("/notifications", requireAuth, async (req, res, next) => {
  try { res.json(await listNotifications(req.user.id, { before: req.query.before, limit: req.query.limit, unreadOnly: req.query.unread === "1" })); } catch (error) { next(error); }
});
router.patch("/notifications/:id", requireAuth, async (req, res, next) => {
  try {
    const unread = await setNotificationRead(req.user.id, req.params.id, req.body?.read !== false);
    if (unread === null) return res.status(404).json({ error: "Notification not found." });
    res.json({ ok: true, unread });
  } catch (error) { next(error); }
});
router.post("/notifications/read", requireAuth, async (req, res, next) => {
  try { await markNotificationsRead(req.user.id); res.json({ ok: true }); } catch (error) { next(error); }
});
export default router;
