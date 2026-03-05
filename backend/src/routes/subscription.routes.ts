import { Router } from 'express';
import { StripeController } from '../controllers/stripe.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createCheckoutSessionSchema = z.object({
  priceId: z.string().min(1, 'Price ID is required'),
  successUrl: z.string().url('Invalid success URL'),
  cancelUrl: z.string().url('Invalid cancel URL'),
  couponCode: z.string().optional(),
});

const createPortalSessionSchema = z.object({
  returnUrl: z.string().url('Invalid return URL'),
});

const applyCouponSchema = z.object({
  couponCode: z.string().min(1, 'Coupon code is required'),
});

const updatePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, 'Payment method ID is required'),
});

// Public routes (no authentication required)
router.get('/plans', StripeController.getPlans);
router.get('/plans/:id', StripeController.getPlanDetails);

// Protected routes (require authentication)
router.use(authenticate);

// Subscription management
router.get('/current', StripeController.getCurrentSubscription);
router.post('/checkout', validate(createCheckoutSessionSchema), StripeController.createCheckoutSession);
router.post('/portal', validate(createPortalSessionSchema), StripeController.createPortalSession);

// Coupon management
router.post('/coupon/validate', validate(applyCouponSchema), StripeController.validateCoupon);
router.post('/coupon/apply', validate(applyCouponSchema), StripeController.applyCoupon);

// Payment methods
router.get('/payment-methods', StripeController.getPaymentMethods);
router.post('/payment-method', validate(updatePaymentMethodSchema), StripeController.addPaymentMethod);
router.put('/payment-method/default', validate(updatePaymentMethodSchema), StripeController.setDefaultPaymentMethod);
router.delete('/payment-method/:id', StripeController.removePaymentMethod);

// Invoice management
router.get('/invoices', StripeController.getInvoices);
router.get('/invoices/:id', StripeController.getInvoice);
router.post('/invoices/:id/pay', StripeController.payInvoice);
router.post('/invoices/:id/retry', StripeController.retryInvoicePayment);

// Usage-based billing (if applicable)
router.get('/usage', StripeController.getUsage);
router.post('/usage/report', StripeController.reportUsage);

// Trial management
router.get('/trial', StripeController.getTrialStatus);
router.post('/trial/extend', StripeController.extendTrial);

// Upgrade/downgrade
router.post('/upgrade', StripeController.upgradeSubscription);
router.post('/downgrade', StripeController.downgradeSubscription);

// Cancellation and reactivation
router.post('/cancel', StripeController.cancelSubscription);
router.post('/reactivate', StripeController.reactivateSubscription);

export default router;