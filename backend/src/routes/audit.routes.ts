import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createAuditSchema = z.object({
  shopUrl: z.string().url('Invalid shop URL').regex(/\.myshopify\.com$/, 'Must be a Shopify store URL'),
  options: z.object({
    seo: z.boolean().optional(),
    performance: z.boolean().optional(),
    accessibility: z.boolean().optional(),
    security: z.boolean().optional(),
    mobile: z.boolean().optional(),
  }).optional(),
});

const updateAuditSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  notes: z.string().optional(),
});

const retryAuditSchema = z.object({
  auditId: z.string().uuid('Invalid audit ID'),
});

const exportAuditSchema = z.object({
  format: z.enum(['pdf', 'csv', 'json']),
  includeDetails: z.boolean().optional(),
});

// All audit routes require authentication
router.use(authenticate);

// Audit management
router.post('/', validate(createAuditSchema), AuditController.createAudit);
router.get('/', AuditController.getUserAudits);
router.get('/:id', AuditController.getAuditById);
router.put('/:id', validate(updateAuditSchema), AuditController.updateAudit);
router.delete('/:id', AuditController.deleteAudit);
router.post('/:id/retry', AuditController.retryAudit);

// Audit results and exports
router.get('/:id/results', AuditController.getAuditResults);
router.post('/:id/export', validate(exportAuditSchema), AuditController.exportAudit);

// Batch operations
router.post('/batch', AuditController.createBatchAudit);
router.get('/batch/:batchId', AuditController.getBatchAudits);

// Real-time updates (WebSocket/SSE would be handled separately)
router.get('/:id/status', AuditController.getAuditStatus);

// Public audit sharing (read-only access without authentication)
router.get('/share/:shareId', AuditController.getSharedAudit);

export default router;