import { prisma } from '../index';
import logger from '../config/logger';
import { Audit, AuditStatus, User } from '@prisma/client';
import { QueueService } from './queue.service';
import { StorageService } from './storage.service';

export interface CreateAuditData {
  userId: string;
  shopifyUrl: string;
}

export interface AuditMetrics {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  mobile: number;
  desktop: number;
}

export interface AuditRecommendation {
  category: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  fix: string;
  impact: string;
}

export interface AuditResult {
  score: number;
  metrics: AuditMetrics;
  recommendations: AuditRecommendation[];
  rawData: any;
}

export class AuditService {
  private static readonly FREE_AUDIT_CREDITS = 1;
  private static readonly SINGLE_AUDIT_PRICE = 999; // 9.99€ in cents

  /**
   * Create a new audit
   */
  static async createAudit(data: CreateAuditData): Promise<Audit> {
    try {
      // Check user credits
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Check if user has credits
      if (user.credits < 1) {
        throw new Error('Insufficient credits. Please purchase more credits.');
      }

      // Validate Shopify URL
      const validatedUrl = this.validateShopifyUrl(data.shopifyUrl);
      if (!validatedUrl) {
        throw new Error('Invalid Shopify URL. Please provide a valid Shopify store URL.');
      }

      // Create audit record
      const audit = await prisma.audit.create({
        data: {
          userId: data.userId,
          shopifyUrl: validatedUrl,
          status: AuditStatus.PENDING,
        },
      });

      // Deduct credit from user
      await prisma.user.update({
        where: { id: data.userId },
        data: {
          credits: {
            decrement: 1,
          },
        },
      });

      // Add to queue for processing
      await QueueService.addToQueue(audit.id);

      logger.info(`Audit created: ${audit.id} for user: ${data.userId}`);
      return audit;
    } catch (error) {
      logger.error('Create audit error:', error);
      throw error;
    }
  }

  /**
   * Validate and normalize Shopify URL
   */
  private static validateShopifyUrl(url: string): string | null {
    try {
      // Remove protocol and normalize
      let normalizedUrl = url.toLowerCase().trim();
      
      // Add https:// if missing
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      // Parse URL
      const urlObj = new URL(normalizedUrl);
      
      // Check if it's a Shopify domain
      const hostname = urlObj.hostname;
      const isShopifyDomain = 
        hostname.endsWith('.myshopify.com') ||
        hostname.includes('shopify.com') ||
        this.detectShopifyStore(hostname);

      if (!isShopifyDomain) {
        return null;
      }

      return normalizedUrl;
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect Shopify store by checking common patterns
   */
  private static detectShopifyStore(hostname: string): boolean {
    // Common Shopify patterns
    const shopifyPatterns = [
      /^[a-zA-Z0-9-]+\.myshopify\.com$/,
      /\.myshopify\.com$/,
      /shopify\.com\/store\//,
    ];

    return shopifyPatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * Process audit (to be called by worker)
   */
  static async processAudit(auditId: string): Promise<void> {
    try {
      // Update audit status
      await prisma.audit.update({
        where: { id: auditId },
        data: { status: AuditStatus.PROCESSING },
      });

      // Get audit details
      const audit = await prisma.audit.findUnique({
        where: { id: auditId },
        include: { user: true },
      });

      if (!audit) {
        throw new Error('Audit not found');
      }

      // Perform SEO analysis
      const result = await this.performSeoAnalysis(audit.shopifyUrl);

      // Generate PDF report
      const pdfUrl = await this.generatePdfReport(audit, result);

      // Update audit with results
      await prisma.audit.update({
        where: { id: auditId },
        data: {
          status: AuditStatus.COMPLETED,
          score: result.score,
          metrics: result.metrics,
          recommendations: result.recommendations,
          pdfUrl: pdfUrl,
          completedAt: new Date(),
        },
      });

      // Create notification for user
      await prisma.notification.create({
        data: {
          userId: audit.userId,
          type: 'AUDIT_COMPLETED',
          title: 'Audit Completed',
          message: `Your SEO audit for ${audit.shopifyUrl} is ready!`,
          data: {
            auditId: audit.id,
            score: result.score,
            pdfUrl: pdfUrl,
          },
        },
      });

      logger.info(`Audit processed successfully: ${auditId}`);
    } catch (error) {
      logger.error(`Audit processing error for ${auditId}:`, error);

      // Update audit as failed
      await prisma.audit.update({
        where: { id: auditId },
        data: {
          status: AuditStatus.FAILED,
        },
      });

      // Refund credit to user
      const audit = await prisma.audit.findUnique({
        where: { id: auditId },
      });

      if (audit) {
        await prisma.user.update({
          where: { id: audit.userId },
          data: {
            credits: {
              increment: 1,
            },
          },
        });
      }

      throw error;
    }
  }

  /**
   * Perform SEO analysis on Shopify store
   */
  private static async performSeoAnalysis(url: string): Promise<AuditResult> {
    // This would integrate with:
    // 1. Google PageSpeed Insights API
    // 2. Lighthouse CLI/API
    // 3. Custom Shopify-specific checks
    // 4. HTML parsing for meta tags, structure, etc.

    // For now, return mock data
    const score = Math.floor(Math.random() * 30) + 70; // 70-100

    const metrics: AuditMetrics = {
      performance: Math.floor(Math.random() * 30) + 70,
      accessibility: Math.floor(Math.random() * 30) + 70,
      bestPractices: Math.floor(Math.random() * 30) + 70,
      seo: Math.floor(Math.random() * 30) + 70,
      mobile: Math.floor(Math.random() * 30) + 70,
      desktop: Math.floor(Math.random() * 30) + 70,
    };

    const recommendations: AuditRecommendation[] = [
      {
        category: 'Performance',
        priority: 'high',
        title: 'Optimize Images',
        description: 'Large images are slowing down your store',
        fix: 'Compress images using Shopify apps or manually',
        impact: 'Can improve load time by 2-3 seconds',
      },
      {
        category: 'SEO',
        priority: 'medium',
        title: 'Add Meta Descriptions',
        description: 'Missing meta descriptions on product pages',
        fix: 'Add unique meta descriptions for each product',
        impact: 'Improves click-through rate from search results',
      },
      {
        category: 'Mobile',
        priority: 'low',
        title: 'Improve Mobile Navigation',
        description: 'Mobile menu could be more user-friendly',
        fix: 'Simplify mobile menu structure',
        impact: 'Better mobile user experience',
      },
    ];

    return {
      score,
      metrics,
      recommendations,
      rawData: { url, timestamp: new Date().toISOString() },
    };
  }

  /**
   * Generate PDF report
   */
  private static async generatePdfReport(audit: Audit, result: AuditResult): Promise<string> {
    // This would use Puppeteer or a PDF library to generate report
    // For now, return mock URL
    
    const fileName = `audit-${audit.id}-${Date.now()}.pdf`;
    const pdfUrl = await StorageService.uploadPdf(fileName, 'mock-pdf-content');

    return pdfUrl;
  }

  /**
   * Get user audits
   */
  static async getUserAudits(userId: string, page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [audits, total] = await Promise.all([
        prisma.audit.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.audit.count({
          where: { userId },
        }),
      ]);

      return {
        audits,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Get user audits error:', error);
      throw error;
    }
  }

  /**
   * Get audit by ID
   */
  static async getAuditById(auditId: string, userId?: string) {
    try {
      const where: any = { id: auditId };
      if (userId) {
        where.userId = userId; // User can only see their own audits
      }

      const audit = await prisma.audit.findUnique({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!audit) {
        throw new Error('Audit not found');
      }

      return audit;
    } catch (error) {
      logger.error('Get audit by ID error:', error);
      throw error;
    }
  }

  /**
   * Cancel audit
   */
  static async cancelAudit(auditId: string, userId: string): Promise<boolean> {
    try {
      const audit = await prisma.audit.findUnique({
        where: { id: auditId, userId },
      });

      if (!audit) {
        throw new Error('Audit not found or not authorized');
      }

      if (audit.status !== AuditStatus.PENDING && audit.status !== AuditStatus.PROCESSING) {
        throw new Error('Cannot cancel audit in current status');
      }

      await prisma.audit.update({
        where: { id: auditId },
        data: {
          status: AuditStatus.CANCELLED,
        },
      });

      // Refund credit
      await prisma.user.update({
        where: { id: userId },
        data: {
          credits: {
            increment: 1,
          },
        },
      });

      logger.info(`Audit cancelled: ${auditId}`);
      return true;
    } catch (error) {
      logger.error('Cancel audit error:', error);
      throw error;
    }
  }

  /**
   * Get audit statistics for user
   */
  static async getAuditStats(userId: string) {
    try {
      const [
        totalAudits,
        completedAudits,
        averageScore,
        recentAudits,
      ] = await Promise.all([
        prisma.audit.count({ where: { userId } }),
        prisma.audit.count({ 
          where: { 
            userId, 
            status: AuditStatus.COMPLETED,
            score: { not: null },
          } 
        }),
        prisma.audit.aggregate({
          where: { 
            userId, 
            status: AuditStatus.COMPLETED,
            score: { not: null },
          },
          _avg: { score: true },
        }),
        prisma.audit.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      return {
        totalAudits,
        completedAudits,
        averageScore: averageScore._avg.score || 0,
        recentAudits,
      };
    } catch (error) {
      logger.error('Get audit stats error:', error);
      throw error;
    }
  }

  /**
   * Check if user can perform audit (credits, limits, etc.)
   */
  static async canUserPerformAudit(userId: string): Promise<{
    canPerform: boolean;
    reason?: string;
    credits: number;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return { canPerform: false, reason: 'User not found', credits: 0 };
      }

      if (user.credits < 1) {
        return { 
          canPerform: false, 
          reason: 'Insufficient credits', 
          credits: user.credits 
        };
      }

      // Check daily limit (optional)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayAudits = await prisma.audit.count({
        where: {
          userId,
          createdAt: {
            gte: today,
          },
        },
      });

      const dailyLimit = 10; // Configurable
      if (todayAudits >= dailyLimit) {
        return {
          canPerform: false,
          reason: 'Daily limit reached',
          credits: user.credits,
        };
      }

      return { canPerform: true, credits: user.credits };
    } catch (error) {
      logger.error('Check user audit capability error:', error);
      return { canPerform: false, reason: 'System error', credits: 0 };
    }
  }
}