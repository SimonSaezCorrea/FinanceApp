import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { reference } from "@finance/contracts";

import { CategoryCodeIcon } from "../../../shared/ui/category-icon";
import { useCategories } from "./useReference";

/** A `FormSelectField` option for a category (value = its id). */
export interface CategoryOption {
  value: string;
  label: string;
  icon: React.ReactNode;
}

/**
 * The global category catalogue, resolved for display: the API only returns a
 * `code`, the name comes from `categories.<code>` in es/en.
 *
 * - `nameOf(id)` → the localized name, or `null` for no/unknown category.
 * - `codeOf(id)` → the catalogue code (drives the icon).
 * - `optionsFor(type, currentId)` → the picker options a user may choose for a
 *   movement of `type` (`reference.isCategorySelectable`, the same predicate the
 *   API enforces), plus `currentId` when it isn't among them — a movement the
 *   server categorised itself ("Deudas") still shows its category when edited.
 */
export function useCategoryCatalog() {
  const { t } = useTranslation();
  const { data } = useCategories();

  const byId = useMemo(() => new Map((data ?? []).map((c) => [c.id, c])), [data]);

  const codeOf = useCallback(
    (id: string | null | undefined) => (id ? (byId.get(id)?.code ?? null) : null),
    [byId],
  );

  const nameOf = useCallback(
    (id: string | null | undefined) => {
      const code = codeOf(id);
      return code ? t(`categories.${code}`, { defaultValue: code }) : null;
    },
    [codeOf, t],
  );

  const optionsFor = useCallback(
    (type?: "INCOME" | "EXPENSE", currentId?: string | null): CategoryOption[] => {
      const toOption = (c: reference.Category): CategoryOption => ({
        value: c.id,
        label: t(`categories.${c.code}`, { defaultValue: c.code }),
        icon: <CategoryCodeIcon code={c.code} className="h-4 w-4 shrink-0 text-muted-foreground" />,
      });
      const list = (data ?? []).filter((c) => reference.isCategorySelectable(c, type));
      const current = currentId ? byId.get(currentId) : undefined;
      if (current && !list.includes(current)) list.push(current);
      return list.map(toOption);
    },
    [byId, data, t],
  );

  return { categories: data ?? [], codeOf, nameOf, optionsFor };
}
