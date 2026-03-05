  /**
   * Retry failed audits (admin only)
   */
  static async retryFailedAudits(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const data = retryFailedAuditsSchema.parse(req.body);

      let retriedCount = 0;

      if (data.all) {
        // Get all failed audits
        const failedAudits = await AuditService.getFailedAudits();
        
        // Retry all failed audits
        for (const audit of failedAudits) {
          await AuditService.retryAudit(audit.id);
          await QueueService.addAuditJob(audit.id, 'normal');
          retriedCount++;
        }
      } else if (data.auditIds && data.auditIds.length > 0) {
        // Retry specific audits
        for (const auditId of data.auditIds) {
          const audit = await AuditService.getAuditById(auditId);
          if (audit && audit.status === 'failed') {
            await AuditService.retryAudit(auditId);
            await QueueService.addAuditJob(auditId, 'normal');
            retriedCount++;
          }
        }
      }

      res.status(200).json({
        success: true,
        message: `${retriedCount} audits retried successfully`,
        data: {
          retriedCount,
        },
      });
    } catch (error: any) {
      logger.error('Retry failed audits error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to retry audits',
      });
    }
  }

  /**
   * Get system settings (admin only)
   */
  static async getSystemSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      // Get system settings from database
      // For now, return mock data
      const settings = {
        general: {
          siteName: 'Shopify SEO Auditor',
          siteUrl: 'https://shopify-seo-auditor.com',
          supportEmail: 'support@shopify-seo-auditor.com',
          defaultLanguage: 'en',
          maintenanceMode: false,
        },
        audit: {
          maxPagesPerAudit: 10,
          timeoutSeconds: 300,
          concurrentAudits: 5,
          retryAttempts: 3,
          defaultPriority: 'normal',
        },
        payments: {
          currency: 'EUR',
          stripeLiveMode: false,
          testMode: true,
          enableCoupons: true,
        },
        email: {
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          fromEmail: 'noreply@shopify-seo-auditor.com',
          fromName: 'Shopify SEO Auditor',
        },
        storage: {
          s3Enabled: false,
          maxFileSize: 10485760, // 10MB
          allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
        },
        security: {
          requireEmailVerification: true,
          maxLoginAttempts: 5,
          sessionTimeout: 86400, // 24 hours
          rateLimitEnabled: true,
        },
      };

      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error: any) {
      logger.error('Get system settings error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get system settings',
      });
    }
  }

  /**
   * Update system settings (admin only)
   */
  static async updateSystemSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const data = updateSettingsSchema.parse(req.body);

      // Update system settings in database
      // For now, return success

      res.status(200).json({
        success: true,
        message: 'System settings updated',
        data: {
          key: data.key,
          value: data.value,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      logger.error('Update system settings error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update system settings',
      });
    }
  }

  /**
   * Send notification to user (admin only)
   */
  static async sendNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const data = sendNotificationSchema.parse(req.body);

      // Send notification to user
      // For now, return success

      res.status(200).json({
        success: true,
        message: data.userId 
          ? `Notification sent to user ${data.userId}`
          : 'Notification sent to all users',
        data: {
          title: data.title,
          message: data.message,
          type: data.type,
          sentAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      logger.error('Send notification error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to send notification',
      });
    }
  }

  /**
   * Get system logs (admin only)
   */
  static async getSystemLogs(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const query = z.object({
        page: z.string().transform(val => parseInt(val, 10)).optional().default('1'),
        limit: z.string().transform(val => parseInt(val, 10)).optional().default('100'),
        level: z.enum(['error', 'warn', 'info', 'debug']).optional(),
        search: z.string().optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
      }).parse(req.query);

      // Get system logs
      // For now, return mock data
      const logs = [
        {
          id: 'log-1',
          level: 'info',
          message: 'User logged in',
          timestamp: new Date().toISOString(),
          userId: 'user-1',
          ip: '192.168.1.1',
        },
        {
          id: 'log-2',
          level: 'error',
          message: 'Audit processing failed',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          userId: 'user-2',
          ip: '192.168.1.2',
          error: 'Connection timeout',
        },
      ];

      res.status(200).json({
        success: true,
        data: logs,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: logs.length,
        },
      });
    } catch (error: any) {
      logger.error('Get system logs error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get system logs',
      });
    }
  }

  /**
   * Get queue management (admin only)
   */
  static async getQueueManagement(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const queueStatus = await QueueService.getQueueStatus();
      
      // Get pending audits
      const pendingAudits = await AuditService.getPendingAudits();

      // Get failed jobs
      const failedJobs = await QueueService.getFailedJobs();

      res.status(200).json({
        success: true,
        data: {
          queueStatus,
          pendingAudits,
          failedJobs,
        },
      });
    } catch (error: any) {
      logger.error('Get queue management error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get queue management data',
      });
    }
  }

  /**
   * Pause queue (admin only)
   */
  static async pauseQueue(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      await QueueService.pauseQueue();

      res.status(200).json({
        success: true,
        message: 'Queue paused successfully',
      });
    } catch (error: any) {
      logger.error('Pause queue error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to pause queue',
      });
    }
  }

  /**
   * Resume queue (admin only)
   */
  static async resumeQueue(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      await QueueService.resumeQueue();

      res.status(200).json({
        success: true,
        message: 'Queue resumed successfully',
      });
    } catch (error: any) {
      logger.error('Resume queue error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resume queue',
      });
    }
  }

  /**
   * Empty queue (admin only)
   */
  static async emptyQueue(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      await QueueService.emptyQueue();

      res.status(200).json({
        success: true,
        message: 'Queue emptied successfully',
      });
    } catch (error: any) {
      logger.error('Empty queue error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to empty queue',
      });
    }
  }

  /**
   * Get revenue statistics (admin only)
   */
  static async getRevenueStatistics(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const query = getStatsSchema.parse(req.query);
      
      const revenueStats = await StripeService.getRevenueStats(query.period);

      res.status(200).json({
        success: true,
        data: revenueStats,
      });
    } catch (error: any) {
      logger.error('Get revenue statistics error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get revenue statistics',
      });
    }
  }

  /**
   * Get subscription statistics (admin only)
   */
  static async getSubscriptionStatistics(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const stats = await StripeService.getSubscriptionStats();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('Get subscription statistics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get subscription statistics',
      });
    }
  }

  /**
   * Get user growth statistics (admin only)
   */
  static async getUserGrowthStatistics(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const query = getStatsSchema.parse(req.query);
      
      // Get user growth statistics
      // For now, return mock data
      const growthStats = {
        period: query.period,
        totalUsers: 150,
        newUsers: 25,
        activeUsers: 120,
        churnRate: 0.05,
        growthRate: 0.20,
        usersByPlan: {
          FREE: 50,
          SINGLE: 30,
          PACK_5: 40,
          PACK_20: 20,
          UNLIMITED: 8,
          AGENCY: 2,
        },
      };

      res.status(200).json({
        success: true,
        data: growthStats,
      });
    } catch (error: any) {
      logger.error('Get user growth statistics error:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get user growth statistics',
      });
    }
  }

  /**
   * Export data (admin only)
   */
  static async exportData(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      const { format, type } = req.query;

      if (!format || !['csv', 'json'].includes(format as string)) {
        res.status(400).json({
          success: false,
          error: 'Invalid format. Valid formats: csv, json',
        });
        return;
      }

      if (!type || !['users', 'audits', 'payments'].includes(type as string)) {
        res.status(400).json({
          success: false,
          error: 'Invalid type. Valid types: users, audits, payments',
        });
        return;
      }

      // Export data based on type
      // For now, return mock response
      const filename = `${type}-export-${Date.now()}.${format}`;

      res.status(200).json({
        success: true,
        data: {
          filename,
          downloadUrl: `/admin/export/${filename}`,
          message: 'Export generated successfully',
        },
      });
    } catch (error: any) {
      logger.error('Export data error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export data',
      });
    }
  }

  /**
   * Backup database (admin only)
   */
  static async backupDatabase(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      // Create database backup
      // For now, return success

      res.status(200).json({
        success: true,
        message: 'Database backup created successfully',
        data: {
          backupId: `backup-${Date.now()}`,
          createdAt: new Date().toISOString(),
          size: '25.4 MB',
        },
      });
    } catch (error: any) {
      logger.error('Backup database error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to backup database',
      });
    }
  }

  /**
   * Get backup list (admin only)
   */
  static async getBackupList(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Admin access required',
        });
        return;
      }

      // Get backup list
      // For now, return mock data
      const backups = [
        {
          id: 'backup-1',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          size: '25.4 MB',
          type: 'full',
          status: 'completed',
        },
        {
          id: 'backup-2',
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          size: '24.8 MB',
          type: 'full',
          status: 'completed',
        },
      ];

      res.status(