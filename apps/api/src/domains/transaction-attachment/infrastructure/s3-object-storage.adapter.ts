import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { readS3Config, type S3Config } from "../../../infra/config/storage.config";
import { AttachmentsUnavailableError } from "../domain/errors";
import type { ObjectStoragePort } from "../domain/ports/object-storage.port";

/**
 * S3-compatible object storage (AWS S3, MinIO, R2, Backblaze — the endpoint is
 * configurable). With no bucket or credentials the adapter is INERT rather than
 * broken: `isConfigured()` is false and every operation answers
 * `503 ATTACHMENTS_UNAVAILABLE`, so the rest of the app is unaffected (FR-024).
 */
@Injectable()
export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly config: S3Config;
  private client: S3Client | null = null;

  constructor(config: ConfigService) {
    this.config = readS3Config(config);
  }

  isConfigured(): boolean {
    return Boolean(this.config.bucket && this.config.accessKeyId && this.config.secretAccessKey);
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.s3(), new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.s3().send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  /** Built lazily so an unconfigured deployment never constructs a client. */
  private s3(): S3Client {
    if (!this.isConfigured()) throw new AttachmentsUnavailableError();
    this.client ??= new S3Client({
      region: this.config.region ?? "us-east-1",
      ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
      // MinIO/R2 address buckets by path, not by subdomain.
      forcePathStyle: this.config.forcePathStyle,
      credentials: {
        accessKeyId: this.config.accessKeyId!,
        secretAccessKey: this.config.secretAccessKey!,
      },
    });
    return this.client;
  }
}
