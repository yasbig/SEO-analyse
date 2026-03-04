import Stripe from 'stripe';
import { prisma } from '../index';
import logger from '../config/logger';
import { User, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

export interface CreateCheckoutSessionData {
  userId: string;
  plan: SubscriptionPlan;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeWebhookData {
  type: string;
  data: {
    object: any;
  };
}

export class StripeService {
  private static stripe: Stripe;
  private static readonly STRIPE_API_VERSION = '2023-10-16';

  /**
   * Initialize Stripe
   */
  static initialize(): void {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: this.STRIPE_API_VERSION,
    });

    logger.info('Stripe service initialized');
  }

  /**
   * Get Stripe instance
   */
  static getInstance(): Stripe {
    if (!this.stripe) {
      this.initialize();
    }
    return this.stripe;
  }

  /**
   * Get price ID for plan
   */
  private static getPriceIdForPlan(plan: SubscriptionPlan): string {
    const priceIds: Record<SubscriptionPlan, string> = {
      [SubscriptionPlan.FREE]: '',
      [SubscriptionPlan.SINGLE]: process.env.STRIPE_PRICE_SINGLE || 'price_single_audit',
      [SubscriptionPlan.PACK_5]: process.env.STRIPE_PRICE_PACK_5 || 'price_pack_5',
      [SubscriptionPlan.PACK_20]: process.env.STRIPE_PRICE_PACK_20 || 'price_pack_20',
      [SubscriptionPlan.UNLIMITED_MONTHLY]: process.env.STRIPE_PRICE_UNLIMITED || 'price_unlimited',
      [SubscriptionPlan.AGENCY]: process.env.STRIPE_PRICE_AGENCY || 'price_agency',
    };

    const priceId = priceIds[plan];
    if (!priceId && plan !== SubscriptionPlan.FREE) {
      throw new Error(`Price ID not configured for plan: ${plan}`);
    }

    return priceId;
  }

  /**
   * Get credits for plan
   */
  private static getCreditsForPlan(plan: SubscriptionPlan): number {
    const creditsMap: Record<SubscriptionPlan, number> = {
      [SubscriptionPlan.FREE]: 1,
      [SubscriptionPlan.SINGLE]: 1,
      [SubscriptionPlan.PACK_5]: 5,
      [SubscriptionPlan.PACK_20]: 20,
      [SubscriptionPlan.UNLIMITED_MONTHLY]: 9999,
      [SubscriptionPlan.AGENCY]: 9999,
    };

    return creditsMap[plan];
  }

  /**
   * Create checkout session
   */
  static async createCheckoutSession(data: CreateCheckoutSessionData): Promise<{ url: string; sessionId: string }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await this.stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: {
            userId: user.id,
          },
        });
        customerId = customer.id;

        // Save customer ID to user
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      }

      // Get price ID for plan
      const priceId = this.getPriceIdForPlan(data.plan);
      if (!priceId) {
        throw new Error('Invalid plan selected');
      }

      // Create checkout session
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        metadata: {
          userId: user.id,
          plan: data.plan,
          credits: this.getCreditsForPlan(data.plan).toString(),
        },
      });

      logger.info(`Checkout session created: ${session.id} for user: ${user.id}`);
      return { url: session.url || '', sessionId: session.id };
    } catch (error) {
      logger.error('Create checkout session error:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook
   */
  static async handleWebhook(event: StripeWebhookData): Promise<void> {
    try {
      const { type, data } = event;
      const object = data.object;

      logger.info(`Processing Stripe webhook: ${type}`);

      switch (type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(object);
          break;

        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(object);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(object);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(object);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(object);
          break;

        default:
          logger.info(`Unhandled webhook type: ${type}`);
      }
    } catch (error) {
      logger.error('Webhook handling error:', error);
      throw error;
    }
  }

  /**
   * Handle checkout session completed
   */
  private static async handleCheckoutSessionCompleted(session: any): Promise<void> {
    try {
      const userId = session.metadata.userId;
      const plan = session.metadata.plan as SubscriptionPlan;
      const credits = parseInt(session.metadata.credits);

      if (!userId || !plan) {
        throw new Error('Missing metadata in session');
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Add credits to user
      await prisma.user.update({
        where: { id: userId },
        data: {
          credits: {
            increment: credits,
          },
        },
      });

      // Create payment record
      await prisma.payment.create({
        data: {
          userId,
          stripePaymentId: session.payment_intent,
          amount: session.amount_total,
          currency: session.currency,
          status: 'SUCCEEDED',
          description: `Purchase: ${plan} plan (${credits} credits)`,
          metadata: session,
        },
      });

      // Create or update subscription if it's a recurring plan
      if (this.isRecurringPlan(plan)) {
        await this.createOrUpdateSubscription(userId, plan, session);
      }

      // Create notification
      await prisma.notification.create({
        data: {
          userId,
          type: 'PAYMENT_RECEIVED',
          title: 'Payment Successful',
          message: `You have received ${credits} credits for your ${plan} plan`,
          data: {
            plan,
            credits,
            amount: session.amount_total / 100, // Convert from cents
          },
        },
      });

      logger.info(`Checkout completed: ${session.id} for user: ${userId}`);
    } catch (error) {
      logger.error('Handle checkout session completed error:', error);
      throw error;
    }
  }

  /**
   * Check if plan is recurring
   */
  private static isRecurringPlan(plan: SubscriptionPlan): boolean {
    const recurringPlans = [
      SubscriptionPlan.UNLIMITED_MONTHLY,
      SubscriptionPlan.AGENCY,
    ];
    return recurringPlans.includes(plan);
  }

  /**
   * Create or update subscription
   */
  private static async createOrUpdateSubscription(
    userId: string,
    plan: SubscriptionPlan,
    session: any
  ): Promise<void> {
    try {
      const subscriptionId = session.subscription;

      const subscriptionData = {
        userId,
        plan,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscriptionId,
        currentPeriodStart: new Date(session.created * 1000),
        currentPeriodEnd: new Date(session.expires_at * 1000),
      };

      // Check if subscription exists
      const existingSubscription = await prisma.subscription.findFirst({
        where: { userId, stripeSubscriptionId: subscriptionId },
      });

      if (existingSubscription) {
        await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: subscriptionData,
        });
      } else {
        await prisma.subscription.create({
          data: subscriptionData,
        });
      }
    } catch (error) {
      logger.error('Create/update subscription error:', error);
      throw error;
    }
  }

  /**
   * Handle payment intent succeeded
   */
  private static async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    try {
      // Payment already handled in checkout.session.completed
      logger.info(`Payment intent succeeded: ${paymentIntent.id}`);
    } catch (error) {
      logger.error('Handle payment intent succeeded error:', error);
      throw error;
    }
  }

  /**
   * Handle payment intent failed
   */
  private static async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    try {
      const userId = paymentIntent.metadata?.userId;
      if (!userId) {
        return;
      }

      // Create payment record for failed payment
      await prisma.payment.create({
        data: {
          userId,
          stripePaymentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: 'FAILED',
          description: 'Payment failed',
          metadata: paymentIntent,
        },
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId,
          type: 'ERROR',
          title: 'Payment Failed',
          message: 'Your payment failed. Please try again or contact support.',
          data: {
            paymentIntentId: paymentIntent.id,
            error: paymentIntent.last_payment_error,
          },
        },
      });

      logger.warn(`Payment failed: ${paymentIntent.id} for user: ${userId}`);
    } catch (error) {
      logger.error('Handle payment intent failed error:', error);
      throw error;
    }
  }

  /**
   * Handle subscription updated
   */
  private static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    try {
      const userId = subscription.metadata?.userId;
      if (!userId) {
        return;
      }

      const plan = this.mapStripePriceToPlan(subscription.items.data[0].price.id);

      const subscriptionData = {
        userId,
        plan,
        status: this.mapStripeStatusToSubscriptionStatus(subscription.status),
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };

      // Update subscription
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: subscriptionData,
      });

      logger.info(`Subscription updated: ${subscription.id}`);
    } catch (error) {
      logger.error('Handle subscription updated error:', error);
      throw error;
    }
  }

  /**
   * Handle subscription deleted
   */
  private static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    try {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      logger.info(`Subscription cancelled: ${subscription.id}`);
    } catch (error) {
      logger.error('Handle subscription deleted error:', error);
      throw error;
    }
  }

  /**
   * Handle invoice payment succeeded
   */
  private static async handleInvoicePaymentSucceeded(invoice: any): Promise<void> {
    try {
      const subscriptionId = invoice.subscription;
      const amount = invoice.amount_paid;
      const currency = invoice.currency;

      // Find subscription
      const subscription = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        include: { user: true },
      });

      if (!subscription) {
        return;
      }

      // Add credits for recurring payment
      const credits = this.getCreditsForPlan(subscription.plan);
      await prisma.user.update({
        where: { id: subscription.userId },
        data: {
          credits: {
            increment: credits,
          },
        },
      });

      // Create payment record
      await prisma.payment.create({
        data: {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          stripePaymentId: invoice.payment_intent,
          amount,
          currency,
          status: 'SUCCEEDED',
          description: `Recurring payment: ${subscription.plan} plan`,
          metadata: invoice,
        },
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId: subscription.userId,
          type: 'PAYMENT_RECEIVED',
          title: 'Recurring Payment Successful',
          message: `Your ${subscription.plan} plan has been renewed. ${credits} credits added.`,
          data: {
            plan: subscription.plan,
            credits,
            amount: amount / 100,
          },
        },
      });

      logger.info(`Invoice payment succeeded: ${invoice.id}`);
    } catch (error) {
      logger.error('Handle invoice payment succeeded error:', error);
      throw error;
    }
  }

  /**
   * Handle invoice payment failed
   */
  private static async handleInvoicePaymentFailed(invoice: any): Promise<void> {
    try {
      const subscriptionId = invoice.subscription;

      // Find subscription
      const subscription = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!subscription) {
        return;
      }

      // Update subscription status
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.PAST_DUE,
        },
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId: subscription.userId,
          type: 'WARNING',
          title: 'Payment Failed',
          message: 'Your recurring payment failed. Please update your payment method.',
          data: {
            invoiceId: invoice.id,
            amountDue: invoice.amount_due / 100,
          },
        },
      });

      logger.warn(`Invoice payment failed: ${invoice.id}`);
    } catch (error) {
      logger.error('Handle invoice payment failed error:', error);
      throw error;
    }
  }

  /**
   * Map Stripe price ID to plan
   */
  private static mapStripePriceToPlan(priceId: string): SubscriptionPlan {
    // This should match your Stripe price IDs
    const priceToPlan: Record<string, SubscriptionPlan> = {
      [process.env.STRIPE_PRICE_SINGLE || 'price_single_audit']: SubscriptionPlan.SINGLE,
      [process.env.STRIPE_PRICE_PACK_5 || 'price_pack_5']: SubscriptionPlan.PACK_5,
      [process.env.STRIPE_PRICE_PACK_20 || 'price_pack_20']: SubscriptionPlan.PACK_20,
      [process.env.STRIPE_PRICE_UNLIMITED || 'price_unlimited']: SubscriptionPlan.UNLIMITED_MONTHLY,
      [process.env.STRIPE_PRICE_AGENCY || 'price_agency']: SubscriptionPlan.AGENCY,
    };

    return priceToPlan[priceId] || SubscriptionPlan.SINGLE;
  }

  /**
   * Map Stripe status to subscription status
   */
  private static mapStripeStatusToSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELLED,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
      trialing: SubscriptionStatus.TRIALING,
      unpaid: SubscriptionStatus.UNPAID,
    };

    return statusMap[stripeStatus] || SubscriptionStatus.ACTIVE;
  }

  /**
   * Get user's Stripe customer portal URL
   */
  static async getCustomerPortalUrl(userId: string): Promise<string> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.stripeCustomerId) {
        throw new Error('User not found or no Stripe customer');
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: process.env.APP_URL || 'http://localhost:3000',
      });

      return session.url;
    } catch (error) {
      logger.error('Get customer portal URL error:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(userId: string): Promise<boolean> {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
        },
      });

      if (!subscription || !subscription.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
