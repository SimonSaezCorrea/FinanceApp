import { z } from "zod";

import { rowId } from "@finance/contracts";

export const investmentIdParamsSchema = z.object({ id: rowId });
export type InvestmentIdParams = z.infer<typeof investmentIdParamsSchema>;
