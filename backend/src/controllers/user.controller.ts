          usage: {
            requests: 1250,
            audits: 45,
          },
        },
        {
          id: '2',
          name: 'Development API Key',
          key: 'sk_*****5678',
          lastUsed: new Date(Date.now() - 604800000).toISOString(),
          createdAt: new Date(Date.now() - 7776000000).toISOString(),
          usage: {
            requests: 320,
            audits: 12,
          },
        },
      ];

      res.status(200).json({
        success: true,
        data: apiKeys,
      });
    } catch (error: any) {
      logger.error('Get API keys error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get API keys',
      });
    }
  }

  /**
   * Create API key
   */
  static async createApiKey(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const schema = z.object({
        name: z.string().min(1, 'API key name is required'),
        permissions: z.array(z.enum(['audit:create', 'audit:read', 'audit:list', 'user:read'])).optional(),
      });

      const data = schema.parse(req.body);

      // Generate API key
      // In a real implementation, generate secure key and store in database
      const apiKey = `sk_${Buffer.from(`${req.user.userId}:${Date.now()}`).toString('base64')}`;

      res.status(201).json({
        success: true,
        data: {
          id: 'new-key',
          name: data.name,
          key: apiKey,
          createdAt: new Date().toISOString(),
          permissions: data.permissions || ['audit:create', 'audit:read', 'audit:list'],
        },
        message: 'API key created successfully. Save this key as it will not be shown again.',
      });
    } catch (error: any) {
      logger.error('Create API key error:', error);

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
        error: 'Failed to create API key',
      });
    }
  }

  /**
   * Delete API key
   */
  static async deleteApiKey(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const { keyId } = req.params;

      // Delete API key from database
      // For now, return success

      res.status(200).json({
        success: true,
        message: 'API key deleted successfully',
      });
    } catch (error: any) {
      logger.error('Delete API key error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete API key',
      });
    }
  }

  /**
   * Get user usage statistics
   */
  static async getUsageStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const query = getUserStatsSchema.parse(req.query);
      
      // Get user usage statistics
      const stats = {
        period: query.period,
        audits: {
          total: 45,
          completed: 40,
          failed: 5,
          averageScore: 78.5,
        },
        credits: {
          used: 45,
          remaining: 5,
          purchased: 50,
        },
        apiUsage: {
          requests: 1250,
          averageResponseTime: 245,
        },
        storage: {
          used: '2.5 MB',
          reports: 40,
        },
      };

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('Get usage stats error:', error);

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
        error: 'Failed to get usage statistics',
      });
    }
  }

  /**
   * Get user settings
   */
  static async getSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const user = await AuthService.getUserById(req.user.userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      const settings = {
        profile: {
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          company: user.company,
          website: user.website,
          phone: user.phone,
        },
        notifications: user.notifications || {
          email: true,
          push: true,
          auditCompleted: true,
          auditFailed: true,
          paymentSuccess: true,
          paymentFailed: true,
          subscriptionRenewal: true,
        },
        preferences: user.preferences || {
          language: 'en',
          timezone: 'UTC',
          currency: 'EUR',
          theme: 'light',
        },
        security: {
          twoFactorEnabled: false,
          lastPasswordChange: user.updatedAt,
        },
      };

      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error: any) {
      logger.error('Get settings error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get settings',
      });
    }
  }

  /**
   * Update user settings
   */
  static async updateSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const settingsSchema = z.object({
        profile: z.object({
          name: z.string().min(1).optional(),
          company: z.string().optional(),
          website: z.string().url().optional(),
          phone: z.string().optional(),
        }).optional(),
        notifications: z.object({
          email: z.boolean().optional(),
          push: z.boolean().optional(),
          auditCompleted: z.boolean().optional(),
          auditFailed: z.boolean().optional(),
          paymentSuccess: z.boolean().optional(),
          paymentFailed: z.boolean().optional(),
          subscriptionRenewal: z.boolean().optional(),
        }).optional(),
        preferences: z.object({
          language: z.enum(['en', 'fr', 'es', 'de', 'it']).optional(),
          timezone: z.string().optional(),
          currency: z.string().length(3).optional(),
          theme: z.enum(['light', 'dark', 'auto']).optional(),
        }).optional(),
      });

      const data = settingsSchema.parse(req.body);

      // Update user settings
      const updateData: any = {};
      
      if (data.profile) {
        updateData.name = data.profile.name;
        updateData.company = data.profile.company;
        updateData.website = data.profile.website;
        updateData.phone = data.profile.phone;
      }

      if (data.notifications) {
        updateData.notifications = data.notifications;
      }

      if (data.preferences) {
        updateData.preferences = data.preferences;
      }

      const user = await AuthService.updateProfile(req.user.userId, updateData);

      res.status(200).json({
        success: true,
        data: user,
        message: 'Settings updated successfully',
      });
    } catch (error: any) {
      logger.error('Update settings error:', error);

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
        error: 'Failed to update settings',
      });
    }
  }

  /**
   * Get user subscription details
   */
  static async getSubscriptionDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const subscription = await StripeService.getUserSubscription(req.user.userId);

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'No active subscription found',
        });
        return;
      }

      // Get subscription usage
      const usage = await StripeService.getSubscriptionUsage(req.user.userId);

      // Get upcoming invoice
      const upcomingInvoice = await StripeService.getUpcomingInvoice(req.user.userId);

      // Get payment methods
      const paymentMethods = await StripeService.getPaymentMethods(req.user.userId);

      res.status(200).json({
        success: true,
        data: {
          subscription,
          usage,
          upcomingInvoice,
          paymentMethods,
        },
      });
    } catch (error: any) {
      logger.error('Get subscription details error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get subscription details',
      });
    }
  }

  /**
   * Get user billing history
   */
  static async getBillingHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const query = z.object({
        limit: z.string().transform(val => parseInt(val, 10)).optional().default('20'),
        startingAfter: z.string().optional(),
      }).parse(req.query);

      const invoices = await StripeService.getUserInvoices(
        req.user.userId,
        query.limit,
        query.startingAfter
      );

      const payments = await StripeService.getUserPaymentHistory(req.user.userId);

      res.status(200).json({
        success: true,
        data: {
          invoices,
          payments,
        },
      });
    } catch (error: any) {
      logger.error('Get billing history error:', error);

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
        error: 'Failed to get billing history',
      });
    }
  }

  /**
   * Get user referral data
   */
  static async getReferralData(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Get user referral data
      const referralData = {
        referralCode: `REF-${req.user.userId.substring(0, 8).toUpperCase()}`,
        referralLink: `https://shopify-seo-auditor.com/ref/${req.user.userId.substring(0, 8)}`,
        referrals: [
          {
            id: '1',
            email: 'referral1@example.com',
            joinedAt: new Date(Date.now() - 2592000000).toISOString(),
            status: 'active',
            reward: '5 credits',
          },
          {
            id: '2',
            email: 'referral2@example.com',
            joinedAt: new Date(Date.now() - 1728000000).toISOString(),
            status: 'pending',
            reward: 'pending',
          },
        ],
        totalReferrals: 2,
        earnedCredits: 5,
        pendingCredits: 5,
      };

      res.status(200).json({
        success: true,
        data: referralData,
      });
    } catch (error: any) {
      logger.error('Get referral data error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get referral data',
      });
    }
  }

  /**
   * Generate referral link
   */
  static async generateReferralLink(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const referralCode = `REF-${req.user.userId.substring(0, 8).toUpperCase()}-${Date.now().toString(36)}`;
      const referralLink = `https://shopify-seo-auditor.com/ref/${referralCode}`;

      res.status(200).json({
        success: true,
        data: {
          referralCode,
          referralLink,
        },
        message: 'Referral link generated',
      });
    } catch (error: any) {
      logger.error('Generate referral link error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate referral link',
      });
    }
  }
}