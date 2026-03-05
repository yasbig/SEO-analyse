import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import logger from '../config/logger';

/**
 * Authorization middleware
 * Checks if the authenticated user has the required role(s)
 */
export const authorize = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        logger.warn('Authorization attempt without authentication', {
          ip: req.ip,
          path: req.path,
        });
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      const userRole = req.user.role || 'user';
      
      // Check if user has one of the allowed roles
      if (!allowedRoles.includes(userRole)) {
        logger.warn('Unauthorized access attempt', {
          userId: req.user.id,
          userRole,
          allowedRoles,
          path: req.path,
          method: req.method,
        });
        
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `You need one of these roles: ${allowedRoles.join(', ')}`,
        });
      }

      // User is authorized
      logger.debug('Authorization successful', {
        userId: req.user.id,
        userRole,
        path: req.path,
      });
      
      next();
    } catch (error: any) {
      logger.error('Authorization middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Authorization check failed',
      });
    }
  };
};

/**
 * Role-based access control middleware factory
 * Creates middleware for specific role requirements
 */
export const requireRole = (role: string) => {
  return authorize([role]);
};

/**
 * Admin-only middleware (convenience wrapper)
 */
export const requireAdmin = authorize(['admin']);

/**
 * Admin or moderator middleware
 */
export const requireAdminOrModerator = authorize(['admin', 'moderator']);

/**
 * Premium user or higher middleware
 */
export const requirePremium = authorize(['premium', 'enterprise', 'admin']);

/**
 * Enterprise user or admin middleware
 */
export const requireEnterprise = authorize(['enterprise', 'admin']);

export default {
  authorize,
  requireRole,
  requireAdmin,
  requireAdminOrModerator,
  requirePremium,
  requireEnterprise,
};