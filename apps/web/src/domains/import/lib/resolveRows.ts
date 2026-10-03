import { reference, type accounts } from "@finance/contracts";

import { matchCard, matchCategory, type CategoryCandidate, type ParsedRow } from "./importParsing";

/** A parsed row with its references resolved — what gets sent to the API. */
export interface ResolvedRow extends ParsedRow {
  categoryId: string | null;
  cardId: string | null;
  /** The file named a category / card that couldn't be used — the default applies. */
  categoryUnmatched: boolean;
  cardUnmatched: boolean;
}

export interface ResolveOptions {
  accountType: accounts.AccountType;
  /** The catalogue, each with the names it can be recognised by. */
  categories: (CategoryCandidate & Pick<reference.Category, "kind" | "isSystem">)[];
  /** The account's own cards. */
  cards: { id: string; last4: string }[];
  /** Used when a row names no category, or one that doesn't match. */
  defaultCategoryId: string | null;
  /** Used when a row names no card, or one that isn't the account's. */
  defaultCardId: string | null;
}

export interface ResolveStats {
  /** Rows whose category text matched the catalogue. */
  categoriesMatched: number;
  /** Rows that had category text the catalogue didn't recognise. */
  categoriesUnmatched: number;
  /** Rows that named a card the account doesn't have. */
  cardsUnmatched: number;
}

/**
 * Turns the file's own words into ids, applying the same rules the API would
 * refuse otherwise — so the preview shows exactly what will be created:
 *
 * - a category must fit the row's type (an income category never lands on an
 *   expense) and never be a system one; one that doesn't falls back to the default,
 *   and the default too is dropped when it doesn't fit;
 * - an income carries no card, and neither does an issuer charge or anything on a
 *   cash account; an issuer charge only exists on a credit card account.
 */
export function resolveRows(
  rows: ParsedRow[],
  options: ResolveOptions,
): { rows: ResolvedRow[]; stats: ResolveStats } {
  const stats: ResolveStats = { categoriesMatched: 0, categoriesUnmatched: 0, cardsUnmatched: 0 };
  const byId = new Map(options.categories.map((c) => [c.id, c]));
  const fits = (id: string | null, type: ParsedRow["type"]) => {
    const category = id ? byId.get(id) : undefined;
    return category && reference.isCategorySelectable(category, type) ? id : null;
  };
  const selectable = options.categories.filter((c) => !c.isSystem);

  const resolved = rows.map((row) => {
    let categoryId: string | null = null;
    let categoryUnmatched = false;
    if (row.categoryText) {
      const matched = fits(matchCategory(row.categoryText, selectable), row.type);
      if (matched) stats.categoriesMatched++;
      else stats.categoriesUnmatched++;
      categoryUnmatched = !matched;
      categoryId = matched;
    }
    categoryId ??= fits(options.defaultCategoryId, row.type);

    const financeCharge =
      options.accountType === "CREDIT_CARD" && row.type === "EXPENSE" && row.financeCharge;
    const canHaveCard = row.type === "EXPENSE" && !financeCharge && options.accountType !== "CASH";
    let cardId: string | null = null;
    let cardUnmatched = false;
    if (canHaveCard) {
      if (row.cardText) {
        cardId = matchCard(row.cardText, options.cards);
        if (!cardId) stats.cardsUnmatched++;
        cardUnmatched = !cardId;
      }
      cardId ??= options.defaultCardId;
    }

    return { ...row, financeCharge, categoryId, cardId, categoryUnmatched, cardUnmatched };
  });

  return { rows: resolved, stats };
}
