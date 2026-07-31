import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

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
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        field: first?.path.join("."),
      });
    }
    return result.data;
  }
}
