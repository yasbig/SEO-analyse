        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const bulkSchema = z.object({
        urls: z.array(z.string().url('Invalid URL')).min(1).max(10),
        priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
        options: z.object({
          includeMobile: z.boolean().optional().default(true),
          includeDesktop: z.boolean().optional().default(true),
          includeSEO: z.boolean().optional().default(true),
          includePerformance: z.boolean().optional().default(true),
          includeAccessibility: z.boolean().optional().default(true),
          includeBestPractices: z.boolean().optional().default(true),
        }).optional().default({}),
      });

      const data = bulkSchema.parse(req.body);

      // Check user credits
      const requiredCredits = data.urls.length;
      const hasCredits = await AuditService.checkUserCredits(req.user.userId, requiredCredits);
      if (!hasCredits) {
        res.status(402).json({
          success: false,
          error: `Insufficient credits. You need ${requiredCredits} credits for ${data.urls.length} audits.`,
        });
        return;
      }

      // Validate Shopify URLs
      const invalidUrls = data.urls.filter(url => 
        !url.toLowerCase().includes('.myshopify.com') && 
        !url.toLowerCase().includes('shopify.com')
      );

      if (invalidUrls.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid Shopify URLs detected',
          invalidUrls,
        });
        return;
      }

      // Create audits
      const audits = [];
      for (const url of data.urls) {
        const audit = await AuditService.createAudit({
          userId: req.user.userId,
          shopifyUrl: url,
          priority: data.priority,
          options: data.options,
        });

        await QueueService.addAuditJob(audit.id, data.priority);
        audits.push(audit);
      }

      // Deduct credits
      await AuditService.deductCredit(req.user.userId, requiredCredits);

      res.status(201).json({
        success: true,
        data: audits,
        message: `${audits.length} audits created successfully`,
      });
    } catch (error: any) {
      logger.error('Bulk create audits error:', error);

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
        error: 'Failed to create bulk audits',
      });
    }
  }

  /**
   * Compare audits
   */
  static async compareAudits(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const compareSchema = z.object({
        auditIds: z.array(z.string().uuid('Invalid audit ID')).min(2).max(5),
      });

      const data = compareSchema.parse(req.body);

      // Check if user owns all audits
      for (const auditId of data.auditIds) {
        const audit = await AuditService.getAuditById(auditId, req.user.userId);
        if (!audit) {
          res.status(404).json({
            success: false,
            error: `Audit ${auditId} not found or access denied`,
          });
          return;
        }

        if (audit.status !== 'completed') {
          res.status(400).json({
            success: false,
            error: `Audit ${auditId} is not completed yet`,
          });
          return;
        }
      }

      // Compare audits
      const comparison = await AuditService.compareAudits(data.auditIds);

      res.status(200).json({
        success: true,
        data: comparison,
      });
    } catch (error: any) {
      logger.error('Compare audits error:', error);

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
        error: 'Failed to compare audits',
      });
    }
  }

  /**
   * Get audit insights
   */
  static async getAuditInsights(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const insights = await AuditService.getUserAuditInsights(req.user.userId);

      res.status(200).json({
        success: true,
        data: insights,
      });
    } catch (error: any) {
      logger.error('Get audit insights error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get audit insights',
      });
    }
  }

  /**
   * Schedule recurring audit
   */
  static async scheduleRecurringAudit(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const scheduleSchema = z.object({
        shopifyUrl: z.string().url('Invalid Shopify URL'),
        frequency: z.enum(['daily', 'weekly', 'monthly']),
        options: z.object({
          includeMobile: z.boolean().optional().default(true),
          includeDesktop: z.boolean().optional().default(true),
          includeSEO: z.boolean().optional().default(true),
          includePerformance: z.boolean().optional().default(true),
        }).optional().default({}),
      });

      const data = scheduleSchema.parse(req.body);

      // Validate Shopify URL
      const shopifyUrl = data.shopifyUrl.toLowerCase();
      if (!shopifyUrl.includes('.myshopify.com') && !shopifyUrl.includes('shopify.com')) {
        res.status(400).json({
          success: false,
          error: 'Please provide a valid Shopify store URL',
        });
        return;
      }

      // Check user subscription for recurring audits
      const canSchedule = await AuditService.canScheduleRecurringAudit(req.user.userId);
      if (!canSchedule) {
        res.status(403).json({
          success: false,
          error: 'Recurring audits require an active subscription',
        });
        return;
      }

      // Schedule recurring audit
      const schedule = await AuditService.scheduleRecurringAudit({
        userId: req.user.userId,
        shopifyUrl: data.shopifyUrl,
        frequency: data.frequency,
        options: data.options,
      });

      res.status(201).json({
        success: true,
        data: schedule,
        message: `Recurring audit scheduled ${data.frequency}`,
      });
    } catch (error: any) {
      logger.error('Schedule recurring audit error:', error);

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
        error: 'Failed to schedule recurring audit',
      });
    }
  }

  /**
   * Cancel recurring audit
   */
  static async cancelRecurringAudit(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { scheduleId } = req.params;

      // Cancel recurring audit
      const cancelled = await AuditService.cancelRecurringAudit(scheduleId, req.user.userId);

      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: 'Schedule not found or access denied',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Recurring audit cancelled successfully',
      });
    } catch (error: any) {
      logger.error('Cancel recurring audit error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel recurring audit',
      });
    }
  }
}