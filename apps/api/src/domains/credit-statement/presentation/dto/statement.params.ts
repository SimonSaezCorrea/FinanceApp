import { z } from "zod";

import { rowId } from "@finance/contracts";

export const statementParamsSchema = z.object({
  id: rowId,
  statementId: rowId,
});
export type StatementParams = z.infer<typeof statementParamsSchema>;
