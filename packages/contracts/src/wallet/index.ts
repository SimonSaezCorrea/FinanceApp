import { z } from "zod";

import { rowId } from "../common/row-id";

/** Wallet domain — user-curated set of pinned cards/accounts shown on the dashboard. */

/** How many accounts/cards the dashboard wallet holds — a quick view, not a list. */
export const WALLET_MAX_ITEMS = 4;

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

/** One entry of a wallet being replaced as a whole: an account or a card. */
export const walletEntrySchema = z
  .object({ accountId: rowId.optional(), cardId: rowId.optional() })
  .refine((v) => Boolean(v.accountId) !== Boolean(v.cardId), {
    message: "provide exactly one of accountId or cardId",
  });

/** `PUT /wallet`: the whole wallet, in display order — at most `WALLET_MAX_ITEMS`,
 * each account or card once. What the "Arma tu cartera" panel saves. */
export const replaceWalletSchema = z
  .object({ items: z.array(walletEntrySchema).max(WALLET_MAX_ITEMS) })
  .refine(
    (v) => {
      const keys = v.items.map((i) => (i.accountId ? `a:${i.accountId}` : `c:${i.cardId}`));
      return new Set(keys).size === keys.length;
    },
    { message: "each account or card at most once", path: ["items"] },
  );
export type ReplaceWallet = z.infer<typeof replaceWalletSchema>;
