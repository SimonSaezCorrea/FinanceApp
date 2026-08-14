export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

/**
 * Where the bytes live. An Adapter port exactly like the Prisma ones: the S3
 * client stays in `infrastructure/`, and the unit tier can use an in-memory
 * fake without touching the network.
 */
export interface ObjectStoragePort {
  /** False when no bucket/credentials are configured — the feature is then
   * inert and every write/read answers `503 ATTACHMENTS_UNAVAILABLE`. */
  isConfigured(): boolean;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Short-lived signed read URL, so the API never proxies the bytes. */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
