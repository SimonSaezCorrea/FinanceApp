import type { wallet } from "@finance/contracts";

import { WalletItemInvalidError } from "./errors";

export interface WalletItemProps {
  id: string;
  userId: string;
  accountId: string | null;
  cardId: string | null;
  order: number;
  createdAt: Date;
}

/** A brand-new wallet pin, as planned by `WalletItem.planCreation` — no
 * `id`/`userId`/`createdAt` yet (the repository adapter assigns them on
 * insert, `userId` supplied separately to `create(userId, plan)`, same
 * convention as `savings`' `PlannedSavingsGoal`). */
export type PlannedWalletItem = Omit<WalletItemProps, "id" | "userId" | "createdAt">;

/**
 * `WalletItem` aggregate: a single dashboard pin — exactly one of
 * `accountId`/`cardId` (never both, never neither). This XOR is the
 * domain's own invariant; it must hold regardless of what upstream
 * validation already enforced.
 */
export class WalletItem {
  private constructor(private props: WalletItemProps) {}

  static fromPersistence(props: WalletItemProps): WalletItem {
    WalletItem.assertXor(props.accountId, props.cardId);
    return new WalletItem({ ...props });
  }

  /** Factory Method (FR-008): plans a brand-new wallet pin's persisted
   * shape from validated `CreateWalletItem` input plus the position it
   * will occupy — `id`/`createdAt` stay a persistence concern. */
  static planCreation(input: {
    accountId?: string;
    cardId?: string;
    order: number;
  }): PlannedWalletItem {
    const accountId = input.accountId ?? null;
    const cardId = input.cardId ?? null;
    WalletItem.assertXor(accountId, cardId);
    return { accountId, cardId, order: input.order };
  }

  private static assertXor(accountId: string | null, cardId: string | null): void {
    const hasAccount = accountId !== null;
    const hasCard = cardId !== null;
    if (hasAccount === hasCard) throw new WalletItemInvalidError();
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get accountId(): string | null {
    return this.props.accountId;
  }
  get cardId(): string | null {
    return this.props.cardId;
  }

  toContract(): wallet.WalletItem {
    return {
      id: this.props.id,
      accountId: this.props.accountId,
      cardId: this.props.cardId,
      order: this.props.order,
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}
