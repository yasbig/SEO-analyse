import { Router } from 'express';
import { StripeController } from '../controllers/stripe.controller';
import { AuditController } from '../controllers/audit.controller';
import { raw } from 'express';

const router = Router();

// Stripe webhooks (raw body required for signature verification)
router.post('/stripe', raw({ type: 'application/json' }), StripeController.handleStripeWebhook);

// Shopify webhooks
router.post('/shopify/audit-completed', AuditController.handleAuditCompletedWebhook);
router.post('/shopify/audit-failed', AuditController.handleAuditFailedWebhook);

// Internal webhooks (for worker communication)
router.post('/internal/audit/start', AuditController.handleAuditStartWebhook);
router.post('/internal/audit/progress', AuditController.handleAuditProgressWebhook);
router.post('/internal/audit/complete', AuditController.handleAuditCompleteWebhook);

// Email webhooks (for email service providers)
router.post('/email/delivered', (req, res) => {
  // Handle email delivery notifications
  console.log('Email delivered:', req.body);
  res.status(200).send('OK');
});

router.post('/email/bounced', (req, res) => {
  // Handle email bounce notifications
  console.log('Email bounced:', req.body);
  res.status(200).send('OK');
});

router.post('/email/opened', (req, res) => {
  // Handle email open tracking
  console.log('Email opened:', req.body);
  res.status(200).send('OK');
});

router.post('/email/clicked', (req, res) => {
  // Handle email click tracking
  console.log('Email clicked:', req.body);
  res.status(200).send('OK');
});

// Analytics webhooks
router.post('/analytics/event', (req, res) => {
  // Handle analytics events from frontend
  console.log('Analytics event:', req.body);
  res.status(200).send('OK');
});

// Monitoring webhooks (for uptime monitoring services)
router.post('/monitoring/status', (req, res) => {
  // Handle status updates from monitoring services
  console.log('Monitoring status:', req.body);
  res.status(200).send('OK');
});

// Integration webhooks (for third-party integrations)
router.post('/integration/slack', (req, res) => {
  // Handle Slack integration webhooks
  console.log('Slack webhook:', req.body);
  res.status(200).send('OK');
});

router.post('/integration/discord', (req, res) => {
  // Handle Discord integration webhooks
  console.log('Discord webhook:', req.body);
  res.status(200).send('OK');
});

// Health check for webhook endpoints
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      'stripe',
      'shopify/audit-completed',
      'shopify/audit-failed',
      'internal/audit/*',
      'email/*',
      'analytics/event',
      'monitoring/status',
      'integration/*'
    ]
  });
});

export default router;