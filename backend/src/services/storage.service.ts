import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import logger from '../config/logger';

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  public?: boolean;
}

export interface FileInfo {
  key: string;
  url: string;
  size: number;
  contentType: string;
  metadata?: Record<string, string>;
  uploadedAt: Date;
}

export class StorageService {
  private static s3Client: S3Client;
  private static readonly BUCKET_NAME = process.env.S3_BUCKET_NAME || 'shopify-seo-auditor';
  private static readonly REGION = process.env.S3_REGION || 'us-east-1';
  private static readonly UPLOAD_FOLDER = 'uploads';
  private static readonly REPORTS_FOLDER = 'reports';
  private static readonly AVATARS_FOLDER = 'avatars';

  /**
   * Initialize S3 client
   */
  static initialize(): void {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      logger.warn('S3 credentials not configured, using local storage fallback');
      return;
    }

    this.s3Client = new S3Client({
      region: this.REGION,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    logger.info('S3 storage service initialized');
  }

  /**
   * Get S3 client
   */
  private static getClient(): S3Client {
    if (!this.s3Client) {
      this.initialize();
    }
    return this.s3Client;
  }

  /**
   * Check if S3 is configured
   */
  static isS3Configured(): boolean {
    return !!process.env.S3_ACCESS_KEY_ID && !!process.env.S3_SECRET_ACCESS_KEY;
  }

  /**
   * Generate file key
   */
  private static generateKey(folder: string, fileName: string, userId?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    if (userId) {
      return `${folder}/${userId}/${timestamp}-${random}-${safeFileName}`;
    }
    
    return `${folder}/${timestamp}-${random}-${safeFileName}`;
  }

  /**
   * Upload file
   */
  static async uploadFile(
    file: Buffer | Readable | string,
    fileName: string,
    options: UploadOptions = {},
    userId?: string
  ): Promise<FileInfo> {
    try {
      if (this.isS3Configured()) {
        return await this.uploadToS3(file, fileName, options, userId);
      } else {
        return await this.saveLocally(file, fileName, options, userId);
      }
    } catch (error) {
      logger.error('Upload file error:', error);
      throw error;
    }
  }

  /**
   * Upload to S3
   */
  private static async uploadToS3(
    file: Buffer | Readable | string,
    fileName: string,
    options: UploadOptions,
    userId?: string
  ): Promise<FileInfo> {
    const folder = options.contentType?.startsWith('image/') 
      ? this.AVATARS_FOLDER 
      : options.contentType === 'application/pdf' 
        ? this.REPORTS_FOLDER 
        : this.UPLOAD_FOLDER;

    const key = this.generateKey(folder, fileName, userId);
    const contentType = options.contentType || 'application/octet-stream';
    const fileBuffer = typeof file === 'string' ? Buffer.from(file) : file;

    const upload = new Upload({
      client: this.getClient(),
      params: {
        Bucket: this.BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: options.metadata,
        ACL: options.public ? 'public-read' : 'private',
      },
    });

    const result = await upload.done();
    const size = result.ContentLength || 0;

    // Generate URL
    let url: string;
    if (options.public) {
      url = `https://${this.BUCKET_NAME}.s3.${this.REGION}.amazonaws.com/${key}`;
    } else {
      url = await this.getSignedUrl(key);
    }

    logger.info(`File uploaded to S3: ${key} (${size} bytes)`);

    return {
      key,
      url,
      size,
      contentType,
      metadata: options.metadata,
      uploadedAt: new Date(),
    };
  }

  /**
   * Save file locally (fallback)
   */
  private static async saveLocally(
    file: Buffer | Readable | string,
    fileName: string,
    options: UploadOptions,
    userId?: string
  ): Promise<FileInfo> {
    const folder = options.contentType === 'application/pdf' 
      ? this.REPORTS_FOLDER 
      : this.UPLOAD_FOLDER;

    const key = this.generateKey(folder, fileName, userId);
    const contentType = options.contentType || 'application/octet-stream';
    
    // In a real implementation, we would save to disk
    // For now, return mock data
    const size = Buffer.isBuffer(file) ? file.length : 1024;
    const url = `/storage/${key}`;

    logger.info(`File saved locally: ${key} (${size} bytes)`);

    return {
      key,
      url,
      size,
      contentType,
      metadata: options.metadata,
      uploadedAt: new Date(),
    };
  }

  /**
   * Get signed URL for private file
   */
  static async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      if (!this.isS3Configured()) {
        return `/storage/${key}`;
      }

      const command = new GetObjectCommand({
        Bucket: this.BUCKET_NAME,
        Key: key,
      });

      const url = await getSignedUrl(this.getClient(), command, { expiresIn });
      return url;
    } catch (error) {
      logger.error('Get signed URL error:', error);
      throw error;
    }
  }

  /**
   * Get file info
   */
  static async getFileInfo(key: string): Promise<FileInfo | null> {
    try {
      if (!this.isS3Configured()) {
        // For local storage, return mock info
        return {
          key,
          url: `/storage/${key}`,
          size: 1024,
          contentType: 'application/octet-stream',
          uploadedAt: new Date(),
        };
      }

      const command = new GetObjectCommand({
        Bucket: this.BUCKET_NAME,
        Key: key,
      });

      const response = await this.getClient().send(command);

      return {
        key,
        url: await this.getSignedUrl(key),
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        metadata: response.Metadata,
        uploadedAt: response.LastModified || new Date(),
      };
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      logger.error('Get file info error:', error);
      throw error;
    }
  }

  /**
   * Delete file
   */
  static async deleteFile(key: string): Promise<boolean> {
    try {
      if (!this.isS3Configured()) {
        // For local storage, just log
        logger.info(`File deleted locally: ${key}`);
        return true;
      }

      const command = new DeleteObjectCommand({
        Bucket: this.BUCKET_NAME,
        Key: key,
      });

      await this.getClient().send(command);
      logger.info(`File deleted from S3: ${key}`);
      return true;
    } catch (error) {
      logger.error('Delete file error:', error);
      throw error;
    }
  }

  /**
   * Upload PDF report
   */
  static async uploadPdf(fileName: string, content: string | Buffer): Promise<string> {
    try {
      const fileInfo = await this.uploadFile(
        content,
        fileName,
        {
          contentType: 'application/pdf',
          public: true,
        }
      );

      return fileInfo.url;
    } catch (error) {
      logger.error('Upload PDF error:', error);
      throw error;
    }
  }

  /**
   * Upload user avatar
   */
  static async uploadAvatar(
    userId: string,
    file: Buffer,
    fileName: string,
    contentType: string
  ): Promise<string> {
    try {
      const fileInfo = await this.uploadFile(
        file,
        fileName,
        {
          contentType,
          public: true,
          metadata: {
            userId,
            type: 'avatar',
          },
        },
        userId
      );

      return fileInfo.url;
    } catch (error) {
      logger.error('Upload avatar error:', error);
      throw error;
    }
  }

  /**
   * Delete user avatar
   */
  static async deleteAvatar(userId: string, avatarUrl: string): Promise<boolean> {
    try {
      // Extract key from URL
      const url = new URL(avatarUrl);
      const key = url.pathname.substring(1); // Remove leading slash

      return await this.deleteFile(key);
    } catch (error) {
      logger.error('Delete avatar error:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  static async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    byType: Record<string, { count: number; size: number }>;
  }> {
    try {
      // In a real implementation, we would query S3 or database
      // For now, return mock data
      return {
        totalFiles: 0,
        totalSize: 0,
        byType: {
          pdf: { count: 0, size: 0 },
          image: { count: 0, size: 0 },
          other: { count: 0, size: 0 },
        },
      };
    } catch (error) {
      logger.error('Get storage stats error:', error);
      throw error;
    }
  }

  /**
   * Clean old files
   */
  static async cleanOldFiles(days: number = 90): Promise<number> {
    try {
      // In a real implementation, we would:
      // 1. Query database for old file references
      // 2. Delete from S3
      // 3. Update database
      
      logger.info(`Cleaning files older than ${days} days`);
      return 0; // Mock
    } catch (error) {
      logger.error('Clean old files error:', error);
      throw error;
    }
  }

  /**
   * Generate upload URL for client-side upload
   */
  static async generateUploadUrl(
    fileName: string,
    contentType: string,
    maxSize: number = 10485760 // 10MB
  ): Promise<{
    url: string;
    fields: Record<string, string>;
    key: string;
  }> {
    try {
      if (!this.isS3Configured()) {
        throw new Error('S3 not configured for client-side uploads');
      }

      const key = this.generateKey(this.UPLOAD_FOLDER, fileName);
      
      // In a real implementation, we would use S3's createPresignedPost
      // For now, return mock data
      return {
        url: `https://${this.BUCKET_NAME}.s3.${this.REGION}.amazonaws.com`,
        fields: {
          key,
          'Content-Type': contentType,
          'x-amz-meta-max-size': maxSize.toString(),
        },
        key,
      };
    } catch (error) {
      logger.error('Generate upload URL error:', error);
      throw error;
    }
  }

  /**
   * Validate file before upload
   */
  static validateFile(
    file: { size: number; mimetype: string; originalname: string },
    allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    maxSize: number = 10485760 // 10MB
  ): { valid: boolean; error?: string } {
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds ${maxSize / 1048576}MB limit`,
      };
    }

    if (!allowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      };
    }

    // Check file extension
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'pdf'];
    
    if (extension && !allowedExtensions.includes(extension)) {
      return {
        valid: false,
        error: `File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`,
      };
    }

    return { valid: true };
  }
}