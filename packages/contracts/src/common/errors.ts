import { z } from "zod";

/**
 * Language-agnostic API error contract (Clarify Q1 / FR-007a, SC-010).
 * The API returns a stable `code`; the frontend maps codes → es/en messages.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(), // SCREAMING_SNAKE_CASE, e.g. "TRANSACTION_NOT_FOUND"
    field: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
