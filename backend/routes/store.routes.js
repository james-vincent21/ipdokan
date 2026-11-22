import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";
import { addProductReview, completeDemoPayment, createOrder, createStripeCheckout, listMyOrders, listProductReviews, listProducts, paymentMode, toggleProductReviewLike } from "../controllers/store.controller.js";

const router = Router();
router.get("/products", listProducts);
router.get("/payments/mode", paymentMode);
router.get("/products/:id/reviews", optionalAuth, listProductReviews);
router.post("/products/:id/reviews", requireAuth, addProductReview);
router.post("/products/:id/reviews/:reviewId/like", requireAuth, toggleProductReviewLike);
router.use("/orders", requireAuth);
router.get("/orders", listMyOrders);
router.post("/orders", createOrder);
router.post("/payments/stripe/session", requireAuth, createStripeCheckout);
router.post("/payments/demo/complete", requireAuth, completeDemoPayment);
export default router;
