import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

import { metaAtPath } from "./zod-issue-meta";

/** Validates request payloads with a zod schema from @finance/contracts. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const first = result.error.issues[0];
      const field = first?.path.join(".");
      const meta = first ? metaAtPath(this.schema, first.path) : undefined;
      const errorCode = typeof meta?.errorCode === "string" ? meta.errorCode : undefined;
      throw new BadRequestException({
        code: errorCode ?? "VALIDATION_FAILED",
        field,
      });
    }
    return result.data;
  }
}
