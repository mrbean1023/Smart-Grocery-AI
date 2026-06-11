import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

export interface UploadOptions {
  buffer: Buffer;
  key: string;
  contentType: string;
}

export type StorageKind = 'recipes' | 'receipts' | 'avatars' | string;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const config: S3ClientConfig = {
      region: process.env.AWS_REGION ?? 'ap-southeast-1',
      maxAttempts: 3,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    };
    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
    }
    const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
    if (accessKeyId && secretAccessKey) {
      config.credentials = { accessKeyId, secretAccessKey };
    }
    this.client = new S3Client(config);
    this.bucket = process.env.S3_BUCKET ?? 'smart-grocery';
    if (!process.env.S3_BUCKET) {
      this.logger.warn(`S3_BUCKET is not set — defaulting to bucket "${this.bucket}"`);
    }
  }

  /** `${kind}/${userId}/${uuid}-${sanitizedFilename}` */
  buildKey(userId: string, kind: StorageKind, filename: string): string {
    const sanitized = filename
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(-100) || 'file';
    return `${kind}/${userId}/${uuidv4()}-${sanitized}`;
  }

  async upload(opts: UploadOptions): Promise<{ key: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: opts.key,
        Body: opts.buffer,
        ContentType: opts.contentType,
      }),
    );
    this.logger.log(`Uploaded ${opts.buffer.length} bytes to s3://${this.bucket}/${opts.key}`);
    return { key: opts.key };
  }

  async getSignedUrl(key: string, expiresSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return presign(this.client, command, { expiresIn: expiresSeconds });
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new InternalServerErrorException(`Empty object body for key ${key}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Deleted s3://${this.bucket}/${key}`);
  }
}
