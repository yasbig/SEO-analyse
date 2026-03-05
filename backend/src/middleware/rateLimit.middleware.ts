import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import logger from '../config/logger';

// Store for tracking blocked IPs (in production, use Redis)
const blockedIPs = new Map<string, number>();

/**
 * Clean up blocked IPs periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamp] of blockedIPs.entries()) {
    if (now - timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      blockedIPs.delete(ip);
      logger.info(`Unblocked IP: ${ip}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

/**
 * Check if IP is blocked
 */
export const isIPBlocked = (ip: string): boolean => {
  const blockedUntil = blockedIPs.get(ip);
  if (!blockedUntil) return false;
  
  if (Date.now() > blockedUntil) {
    blockedIPs.delete(ip);
    return false;
  }
  
  return true;
};

/**
 * Block an IP address
 */
export const blockIP = (ip: string, durationMs: number = 24 * 60 * 60 * 1000): void => {
  const blockedUntil = Date.now() + durationMs;
  blockedIPs.set(ip, blockedUntil);
  logger.warn(`Blocked IP: ${ip} until ${new Date(blockedUntil).toISOString()}`);
};

/**
 * Main rate limiter for API endpoints
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false,
  keyGenerator: (req: Request) => {
    // Use IP address as key
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Log rate limit violation
    logger.warn('Rate limit exceeded', {
      ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('user-agent'),
    });
    
    // Block IP if they exceed rate limit multiple times
    const violationCount = parseInt(req.headers['ratelimit-remaining'] as string) || 0;
    if (violationCount >= 3) {
      blockIP(ip);
    }
    
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Please try again later.',
      retryAfter: Math.ceil(15 * 60), // 15 minutes in seconds
    });
  },
});

/**
 * Stricter rate limiter for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 login attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req: Request) => {
    // Use IP + email for auth endpoints to prevent targeted attacks
    const email = req.body?.email || 'unknown';
    return `${req.ip}-${email}`;
  },
  handler: (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = req.body?.email || 'unknown';
    
    logger.warn('Auth rate limit exceeded', {
      ip,
      email,
      path: req.path,
      method: req.method,
    });
    
    // Block IP for auth attempts
    blockIP(ip, 60 * 60 * 1000); // 1 hour block
    
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts',
      message: 'Please try again in an hour.',
      retryAfter: 3600, // 1 hour in seconds
    });
  },
});

/**
 * Loose rate limiter for public endpoints
 */
export const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * Strict rate limiter for admin endpoints
 */
export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per 15 minutes for admin
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use user ID for admin endpoints if available
    const userId = (req as any).user?.id || 'unknown';
    return `${req.ip}-${userId}`;
  },
});

/**
 * No rate limiting for webhooks (they need to process incoming data)
 */
export const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Very high limit for webhooks
  standardHeaders: true,
  legacyHeaders: false,
});

// Export default as the main rate limiter
export default rateLimitMiddleware;