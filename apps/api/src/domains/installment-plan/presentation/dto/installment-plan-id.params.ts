import { z } from "zod";

import { rowId } from "@finance/contracts";

export const installmentPlanIdParamsSchema = z.object({ id: rowId });
export type InstallmentPlanIdParams = z.infer<typeof installmentPlanIdParamsSchema>;
