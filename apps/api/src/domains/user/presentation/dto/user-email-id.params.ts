import { z } from "zod";

import { rowId } from "@finance/contracts";

export const userEmailIdParamsSchema = z.object({ id: rowId });
export type UserEmailIdParams = z.infer<typeof userEmailIdParamsSchema>;
