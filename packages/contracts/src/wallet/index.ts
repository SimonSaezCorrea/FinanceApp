import { z } from "zod";

import { rowId } from "../common/row-id";

/** Wallet domain — user-curated set of pinned cards/accounts shown on the dashboard. */

export const walletItemSchema = z.object({
  id: rowId,
  /** Exactly one of accountId / cardId is set. */
  accountId: rowId.nullable(),
  cardId: rowId.nullable(),
  order: z.number().int(),
  createdAt: z.string(),
});
export type WalletItem = z.infer<typeof walletItemSchema>;

export const createWalletItemSchema = z
  .object({
    accountId: rowId.optional(),
    cardId: rowId.optional(),
  })
  .refine((v) => Boolean(v.accountId) !== Boolean(v.cardId), {
    message: "provide exactly one of accountId or cardId",
  });
export type CreateWalletItem = z.infer<typeof createWalletItemSchema>;

/** Persist a new manual order: the full list of item ids, in the desired order. */
export const reorderWalletSchema = z.object({
  ids: z.array(rowId).min(1),
});
export type ReorderWallet = z.infer<typeof reorderWalletSchema>;
