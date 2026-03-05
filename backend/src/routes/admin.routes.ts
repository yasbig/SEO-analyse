import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/authorize.middleware';
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const updateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin', 'moderator']),
});

const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'banned']),
  reason: z.string().optional(),
});

const addCreditsSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  credits: z.number().min(1, 'Credits must be at least 1'),
  reason: z.string().min(1, 'Reason is required'),
});

const updateAuditSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  notes: z.string().optional(),
  result: z.any().optional(),
});

const updateSystemSettingsSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  registrationEnabled: z.boolean().optional(),
  maxAuditsPerUser: z.number().min(1).optional(),
  auditTimeoutMinutes: z.number().min(1).optional(),
  stripeEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  notificationSettings: z.object({
    auditCompleted: z.boolean().optional(),
    auditFailed: z.boolean().optional(),
    newUser: z.boolean().optional(),
    paymentReceived: z.boolean().optional(),
  }).optional(),
});

const sendNotificationSchema = z.object({
  userId: z.string().uuid('Invalid user ID').optional(),
  userGroup: z.enum(['all', 'free', 'premium', 'enterprise']).optional(),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  type: z.enum(['info', 'warning', 'success', 'error']),
  actionUrl: z.string().url('Invalid action URL').optional(),
});

const exportDataSchema = z.object({
  format: z.enum(['csv', 'json', 'excel']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  includeSensitive: z.boolean().optional(),
});

// All admin routes require authentication and admin authorization
router.use(authenticate);
router.use(authorize(['admin']));

// Admin dashboard
router.get('/dashboard', AdminController.getDashboardStats);

// User management
router.get('/users', AdminController.listUsers);
router.get('/users/:id', AdminController.getUserDetails);
router.put('/users/:id/role', validate(updateUserRoleSchema), AdminController.updateUserRole);
router.put('/users/:id/status', validate(updateUserStatusSchema), AdminController.updateUserStatus);
router.post('/users/credits', validate(addCreditsSchema), AdminController.addCredits);

// Audit management
router.get('/audits', AdminController.listAudits);
router.get('/audits/:id', AdminController.getAuditDetails);
router.put('/audits/:id', validate(updateAuditSchema), AdminController.updateAudit);
router.delete('/audits/:id', AdminController.deleteAudit);
router.post('/audits/retry-failed', AdminController.retryFailedAudits);

// System settings
router.get('/settings', AdminController.getSystemSettings);
router.put('/settings', validate(updateSystemSettingsSchema), AdminController.updateSystemSettings);

// Notifications
router.post('/notifications/send', validate(sendNotificationSchema), AdminController.sendNotification);

// System monitoring
router.get('/logs', AdminController.getSystemLogs);
router.get('/logs/:type', AdminController.getLogsByType);
router.get('/queue', AdminController.getQueueStatus);
router.get('/queue/:queueName', AdminController.getQueueDetails);
router.post('/queue/:queueName/purge', AdminController.purgeQueue);
router.post('/queue/:queueName/retry', AdminController.retryFailedJobs);

// Revenue and statistics
router.get('/revenue', AdminController.getRevenueStatistics);
router.get('/subscriptions/stats', AdminController.getSubscriptionStats);
router.get('/users/growth', AdminController.getUserGrowthStats);

// Data export
router.post('/export', validate(exportDataSchema), AdminController.exportData);

// Database management
router.post('/backup', AdminController.createDatabaseBackup);
router.get('/backups', AdminController.listBackups);
router.get('/backups/:id', AdminController.getBackupDetails);
router.post('/backups/:id/restore', AdminController.restoreBackup);
router.delete('/backups/:id', AdminController.deleteBackup);

// System maintenance
router.post('/maintenance/start', AdminController.startMaintenance);
router.post('/maintenance/end', AdminController.endMaintenance);
router.get('/maintenance/status', AdminController.getMaintenanceStatus);

// Cache management
router.post('/cache/clear', AdminController.clearCache);
router.get('/cache/stats', AdminController.getCacheStats);

// Health checks
router.get('/health', AdminController.getSystemHealth);
router.get('/health/detailed', AdminController.getDetailedHealth);

export default router;