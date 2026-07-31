import type { PlannedWalletItem, WalletItem } from "../wallet-item.aggregate";

export const WALLET_ITEM_REPOSITORY = Symbol("WALLET_ITEM_REPOSITORY");

/** Domain-owned port (Adapter, FR-011) — zero Prisma imports. Named
 * operations only, not a generic CRUD surface. */
export interface WalletItemRepositoryPort {
  list(userId: string): Promise<WalletItem[]>;
  count(userId: string): Promise<number>;
  accountOwned(userId: string, accountId: string): Promise<boolean>;
  cardOwned(userId: string, cardId: string): Promise<boolean>;
  existing(userId: string, accountId?: string, cardId?: string): Promise<boolean>;
  create(userId: string, plan: PlannedWalletItem): Promise<WalletItem>;
  reorder(userId: string, ids: string[]): Promise<void>;
  remove(userId: string, id: string): Promise<boolean>;
}
