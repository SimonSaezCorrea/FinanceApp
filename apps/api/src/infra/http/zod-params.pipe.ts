import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

import { metaAtPath } from "./zod-issue-meta";

/**
 * Validates route path params (`@Param()`) with a zod schema — the path-param
 * counterpart of `ZodValidationPipe` (which validates body/query). Closes the
 * gap where `:id`-shaped params were plain unvalidated strings (FR-010).
 */
export class ZodParamsPipe<T> implements PipeTransform<unknown, T> {
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
