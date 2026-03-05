import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  notificationPreferences: z.object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    auditCompleted: z.boolean().optional(),
    auditFailed: z.boolean().optional(),
    monthlyReport: z.boolean().optional(),
  }).optional(),
});

const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  resultsPerPage: z.number().min(5).max(100).optional(),
  autoRefresh: z.boolean().optional(),
  exportFormat: z.enum(['pdf', 'csv', 'json']).optional(),
  dataRetentionDays: z.number().min(1).max(365).optional(),
});

const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required'),
  permissions: z.array(z.enum(['audit:create', 'audit:read', 'audit:list', 'user:read'])).optional(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').optional(),
  isActive: z.boolean().optional(),
});

const updateSubscriptionSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  paymentMethodId: z.string().optional(),
});

const cancelSubscriptionSchema = z.object({
  reason: z.string().optional(),
  feedback: z.string().optional(),
});

const updateBillingSchema = z.object({
  billingEmail: z.string().email('Invalid email address').optional(),
  companyName: z.string().optional(),
  taxId: z.string().optional(),
  address: z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});

// All user routes require authentication
router.use(authenticate);

// User profile
router.get('/me', UserController.getCurrentUser);
router.put('/profile', validate(updateProfileSchema), UserController.updateProfile);
router.delete('/account', UserController.deleteAccount);

// User dashboard
router.get('/dashboard', UserController.getDashboardData);

// Notifications
router.get('/notifications', UserController.getNotifications);
router.put('/notifications/:id/read', UserController.markNotificationAsRead);
router.delete('/notifications/:id', UserController.deleteNotification);
router.put('/notifications/read-all', UserController.markAllNotificationsAsRead);

// Activity log
router.get('/activity', UserController.getActivityLog);

// Avatar management
router.post('/avatar', UserController.uploadAvatar);
router.delete('/avatar', UserController.deleteAvatar);

// API keys management
router.get('/api-keys', UserController.getApiKeys);
router.post('/api-keys', validate(createApiKeySchema), UserController.createApiKey);
router.put('/api-keys/:id', validate(updateApiKeySchema), UserController.updateApiKey);
router.delete('/api-keys/:id', UserController.deleteApiKey);
router.post('/api-keys/:id/regenerate', UserController.regenerateApiKey);

// Usage statistics
router.get('/usage', UserController.getUsageStats);

// User settings
router.get('/settings', UserController.getSettings);
router.put('/settings', validate(updateSettingsSchema), UserController.updateSettings);

// Subscription management
router.get('/subscription', UserController.getSubscriptionDetails);
router.put('/subscription', validate(updateSubscriptionSchema), UserController.updateSubscription);
router.post('/subscription/cancel', validate(cancelSubscriptionSchema), UserController.cancelSubscription);
router.post('/subscription/reactivate', UserController.reactivateSubscription);

// Billing history
router.get('/billing', UserController.getBillingHistory);
router.get('/billing/:invoiceId', UserController.getInvoice);

// Billing information
router.get('/billing-info', UserController.getBillingInfo);
router.put('/billing-info', validate(updateBillingSchema), UserController.updateBillingInfo);

// Referral system
router.get('/referrals', UserController.getReferrals);
router.get('/referral-stats', UserController.getReferralStats);
router.post('/generate-referral-link', UserController.generateReferralLink);

export default router;