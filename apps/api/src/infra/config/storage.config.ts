import { ConfigService } from "@nestjs/config";
import { z } from "zod";

/**
 * Object-storage settings for movement attachments.
 *
 * Every field is optional on purpose: the feature is inert without credentials
 * (research D2 / FR-024) and no default may pretend a bucket exists.
 */
export const s3ConfigSchema = z.object({
  S3_ENDPOINT: z.string().trim().url().optional(),
  S3_REGION: z.string().trim().min(1).optional(),
  S3_BUCKET: z.string().trim().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.union([z.literal("true"), z.literal("false")]).optional(),
});

export type S3Config = {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
};

const blankToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function readS3Config(config: ConfigService): S3Config {
  const parsed = s3ConfigSchema.safeParse({
    S3_ENDPOINT: blankToUndefined(config.get<string>("S3_ENDPOINT")),
    S3_REGION: blankToUndefined(config.get<string>("S3_REGION")),
    S3_BUCKET: blankToUndefined(config.get<string>("S3_BUCKET")),
    S3_ACCESS_KEY_ID: blankToUndefined(config.get<string>("S3_ACCESS_KEY_ID")),
    S3_SECRET_ACCESS_KEY: blankToUndefined(config.get<string>("S3_SECRET_ACCESS_KEY")),
    S3_FORCE_PATH_STYLE: blankToUndefined(config.get<string>("S3_FORCE_PATH_STYLE")),
  });

  // A malformed value is treated as "not configured" rather than crashing boot:
  // attachments are optional, the rest of the API is not.
  if (!parsed.success) return { forcePathStyle: false };

  const env = parsed.data;
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  };
}
