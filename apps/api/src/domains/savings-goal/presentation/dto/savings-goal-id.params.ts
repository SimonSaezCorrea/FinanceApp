import { z } from "zod";

import { rowId } from "@finance/contracts";

export const savingsGoalIdParamsSchema = z.object({ id: rowId });
export type SavingsGoalIdParams = z.infer<typeof savingsGoalIdParamsSchema>;
