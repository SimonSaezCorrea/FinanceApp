import { z } from "zod";

import { rowId } from "@finance/contracts";

export const recurringIdParamsSchema = z.object({ id: rowId });
export type RecurringIdParams = z.infer<typeof recurringIdParamsSchema>;
