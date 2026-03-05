import { Router } from 'express';
import authRoutes from './auth.routes';
import auditRoutes from './audit.routes';
import userRoutes from './user.routes';
import subscriptionRoutes from './subscription.routes';
import adminRoutes from './admin.routes';
import webhookRoutes from './webhook.routes';
import { rateLimit } from '../middleware/rateLimit.middleware';

const router = Router();

// API version prefix
const API_PREFIX = '/api/v1';

// Apply rate limiting to all routes (except webhooks)
router.use(rateLimit);

// Health check endpoint (public)
router.get(`${API_PREFIX}/health`, (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Shopify SEO Auditor API',
    version: '1.0.0',
  });
});

// API documentation endpoint (public)
router.get(`${API_PREFIX}/docs`, (req, res) => {
  res.status(200).json({
    documentation: 'https://docs.shopify-seo-auditor.com/api',
    endpoints: {
      auth: `${API_PREFIX}/auth/*`,
      audits: `${API_PREFIX}/audits/*`,
      users: `${API_PREFIX}/users/*`,
      subscriptions: `${API_PREFIX}/subscriptions/*`,
      admin: `${API_PREFIX}/admin/*`,
      webhooks: `${API_PREFIX}/webhooks/*`,
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <token>',
    },
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
    },
  });
});

// Mount routes with API prefix
router.use(`${API_PREFIX}/auth`, authRoutes);
router.use(`${API_PREFIX}/audits`, auditRoutes);
router.use(`${API_PREFIX}/users`, userRoutes);
router.use(`${API_PREFIX}/subscriptions`, subscriptionRoutes);
router.use(`${API_PREFIX}/admin`, adminRoutes);

// Webhooks don't use API prefix and have different rate limiting
router.use('/webhooks', webhookRoutes);

// 404 handler for undefined routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      `${API_PREFIX}/health`,
      `${API_PREFIX}/docs`,
      `${API_PREFIX}/auth/*`,
      `${API_PREFIX}/audits/*`,
      `${API_PREFIX}/users/*`,
      `${API_PREFIX}/subscriptions/*`,
      `${API_PREFIX}/admin/*`,
      '/webhooks/*',
    ],
  });
});

// Error handling middleware (should be registered last)
router.use((error: any, req: any, res: any, next: any) => {
  console.error('API Error:', error);
  
  // Default error response
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

export default router;