import { z } from "zod";

import { rowId } from "@finance/contracts";

export const debtIdParamsSchema = z.object({ id: rowId });
export type DebtIdParams = z.infer<typeof debtIdParamsSchema>;
