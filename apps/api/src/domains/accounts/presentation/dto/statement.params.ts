import { z } from "zod";

export const statementParamsSchema = z.object({ id: z.string().min(1), statementId: z.string().min(1) });
export type StatementParams = z.infer<typeof statementParamsSchema>;
