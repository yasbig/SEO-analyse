import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API version prefix
const API_PREFIX = '/api/v1';

// Mount routes here
// Example: router.use(`${API_PREFIX}/auth`, authRoutes);

// 404 handler
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

export default router;