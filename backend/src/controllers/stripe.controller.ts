import { Request, Response } from 'express';
import { StripeService } from '../services/stripe.service';
import { AuthRequest } from '../middleware/auth.middleware';
import logger from '../config/logger';
import { z } from 'zod';

// Validation schemas
const createCheckoutSessionSchema = z.object({
  planId: z.enum(['FREE', 'SINGLE', 'PACK_5', 'PACK_20', 'UNLIMITED', 'AGENCY']),
  successUrl: z.string().url('Invalid success URL'),
  cancelUrl: z.string().url('Invalid cancel URL'),
});

const createCustomerPortalSchema = z.object({
  returnUrl: z.string().url('Invalid return URL'),
});

const createOneTimePaymentSchema = z.object({
  amount: z.number().min(1, 'Amount must be at least 1'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('eur'),
  description: z.string().min(1, 'Description is required'),
  successUrl: z.string().url('Invalid success URL'),
  cancelUrl: z.string().url('Invalid cancel URL'),
});

const updateSubscriptionSchema = z.object({
  planId: z.enum(['FREE', 'SINGLE', 'PACK_5', 'PACK_20', 'UNLIMITED', 'AGENCY']),
});

const cancelSubscriptionSchema = z.object({
  reason: z.string().optional(),
});

const applyCouponSchema = z.object({
  couponCode: z.string().min(1, 'Coupon code is required'),
});

const getInvoicesSchema = z.object({
  limit: z.string().transform(val => parseInt(val, 10)).optional().default('10'),
  startingAfter: z.string().optional(),
});

export class StripeController {
  /**
   * Create checkout session for subscription
   */
  static async createCheckoutSession(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const data = createCheckoutSessionSchema.parse(req.body);
      
      const session = await StripeService.createCheckoutSession({
        userId: req.user.userId,
        planId: data.planId,
        successUrl: data.successUrl,
        cancelUrl: data.cancelUrl,
      });

      res.status(200).json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
        },
        message: 'Checkout session created',
      });
    } catch (error: any) {
      logger.error('Create checkout session error:', error);

      if (error.message === 'User already has active subscription') {
        res.status(400).json({
          success: false,
          error: 'You already have an active subscription',
        });
        return;
      }

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create checkout session',
      });
    }
  }

  /**
   * Create customer portal session
   */
  static async createCustomerPortal(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const data = createCustomerPortalSchema.parse(req.body);
      
      const portalSession = await StripeService.createCustomerPortalSession(
        req.user.userId,
        data.returnUrl
      );

      if (!portalSession) {
        res.status(404).json({
          success: false,
          error: 'No active subscription found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          url: portalSession.url,
        },
        message: 'Customer portal session created',
      });
    } catch (error: any) {
      logger.error('Create customer portal error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create customer portal',
      });
    }
  }

  /**
   * Get current subscription
   */
  static async getSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const subscription = await StripeService.getUserSubscription(req.user.userId);

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'No active subscription found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: subscription,
      });
    } catch (error: any) {
      logger.error('Get subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get subscription',
      });
    }
  }

  /**
   * Update subscription
   */
  static async updateSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const data = updateSubscriptionSchema.parse(req.body);
      
      const updatedSubscription = await StripeService.updateSubscription(
        req.user.userId,
        data.planId
      );

      res.status(200).json({
        success: true,
        data: updatedSubscription,
        message: 'Subscription updated successfully',
      });
    } catch (error: any) {
      logger.error('Update subscription error:', error);

      if (error.message === 'No active subscription found') {
        res.status(404).json({
          success: false,
          error: 'No active subscription found',
        });
        return;
      }

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update subscription',
      });
    }
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const data = cancelSubscriptionSchema.parse(req.body);
      
      const cancelled = await StripeService.cancelSubscription(
        req.user.userId,
        data.reason
      );

      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: 'No active subscription found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Subscription cancelled successfully',
        data: {
          cancelledAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      logger.error('Cancel subscription error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription',
      });
    }
  }

  /**
   * Create one-time payment
   */
  static async createOneTimePayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const data = createOneTimePaymentSchema.parse(req.body);
      
      const session = await StripeService.createOneTimePayment({
        userId: req.user.userId,
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        successUrl: data.successUrl,
        cancelUrl: data.cancelUrl,
      });

      res.status(200).json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
        },
        message: 'Payment session created',
      });
    } catch (error: any) {
      logger.error('Create one-time payment error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create payment session',
      });
    }
  }

  /**
   * Get payment history
   */
  static async getPaymentHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const payments = await StripeService.getUserPaymentHistory(req.user.userId);

      res.status(200).json({
        success: true,
        data: payments,
      });
    } catch (error: any) {
      logger.error('Get payment history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payment history',
      });
    }
  }

  /**
   * Get invoices
   */
  static async getInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const query = getInvoicesSchema.parse(req.query);
      
      const invoices = await StripeService.getUserInvoices(
        req.user.userId,
        query.limit,
        query.startingAfter
      );

      res.status(200).json({
        success: true,
        data: invoices,
      });
    } catch (error: any) {
      logger.error('Get invoices error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get invoices',
      });
    }
  }

  /**
   * Get invoice PDF
   */
  static async getInvoicePdf(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { invoiceId } = req.params;

      const invoicePdf = await StripeService.getInvoicePdf(req.user.userId, invoiceId);

      if (!invoicePdf) {
        res.status(404).json({
          success: false,
          error: 'Invoice not found or access denied',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          pdfUrl: invoicePdf,
        },
      });
    } catch (error: any) {
      logger.error('Get invoice PDF error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get invoice PDF',
      });
    }
  }

  /**
   * Apply coupon
   */
  static async applyCoupon(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const data = applyCouponSchema.parse(req.body);
      
      const applied = await StripeService.applyCoupon(req.user.userId, data.couponCode);

      if (!applied) {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired coupon code',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Coupon applied successfully',
        data: {
          couponCode: data.couponCode,
          discount: applied.discount,
        },
      });
    } catch (error: any) {
      logger.error('Apply coupon error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to apply coupon',
      });
    }
  }

  /**
   * Get available plans
   */
  static async getPlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = await StripeService.getAvailablePlans();

      res.status(200).json({
        success: true,
        data: plans,
      });
    } catch (error: any) {
      logger.error('Get plans error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get plans',
      });
    }
  }

  /**
   * Get plan details
   */
  static async getPlanDetails(req: Request, res: Response): Promise<void> {
    try {
      const { planId } = req.params;

      const plan = await StripeService.getPlanDetails(planId);

      if (!plan) {
        res.status(404).json({
          success: false,
          error: 'Plan not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: plan,
      });
    } catch (error: any) {
      logger.error('Get plan details error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get plan details',
      });
    }
  }

  /**
   * Get subscription usage
   */
  static async getSubscriptionUsage(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const usage = await StripeService.getSubscriptionUsage(req.user.userId);

      res.status(200).json({
        success: true,
        data: usage,
      });
    } catch (error: any) {
      logger.error('Get subscription usage error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get subscription usage',
      });
    }
  }

  /**
   * Get upcoming invoice
   */
  static async getUpcomingInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const invoice = await StripeService.getUpcomingInvoice(req.user.userId);

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: 'No upcoming invoice found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: invoice,
      });
    } catch (error: any) {
      logger.error('Get upcoming invoice error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get upcoming invoice',
      });
    }
  }

  /**
   * Get payment methods
   */
  static async getPaymentMethods(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const paymentMethods = await StripeService.getPaymentMethods(req.user.userId);

      res.status(200).json({
        success: true,
        data: paymentMethods,
      });
    } catch (error: any) {
      logger.error('Get payment methods error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payment methods',
      });
    }
  }

  /**
   * Update default payment method
   */
  static async updateDefaultPaymentMethod(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { paymentMethodId } = req.params;

      const updated = await StripeService.updateDefaultPaymentMethod(
        req.user.userId,
        paymentMethodId
      );

      if (!updated) {
        res.status(400).json({
          success: false,
          error: 'Failed to update payment method',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Default payment method updated',
      });
    } catch (error: any) {
      logger.error('Update default payment method error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update payment method',
      });
    }
  }

  /**
   * Remove payment method
   */
  static async removePaymentMethod(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { paymentMethodId } = req.params;

      const removed = await StripeService.removePaymentMethod(
        req.user.userId,
        paymentMethodId
      );

      if (!removed) {
        res.status(400).json({
          success: false,
          error: 'Failed to remove payment method',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Payment method removed',
      });
    } catch (error: any) {
      logger.error('Remove payment method error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove payment method',
      });
    }
  }

  /**
   * Get tax rates
