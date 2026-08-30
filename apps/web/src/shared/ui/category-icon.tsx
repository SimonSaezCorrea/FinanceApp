import { createElement } from "react";

import { categoryIcon } from "../lib/categoryIcons";

interface CategoryIconProps {
  category: string | null;
  className?: string;
}

/**
 * Renders the Lucide icon that matches a transaction's category.
 *
 * Exists so consumers don't do `const Icon = categoryIcon(tx.category)` inside
 * their own render: assigning a component to a local during render is what
 * `react-hooks/static-components` flags, and it also defeats memoization on the
 * element tree. The lookup itself stays in `lib/categoryIcons.ts` (unit-tested).
 */
export function CategoryIcon({ category, className }: Readonly<CategoryIconProps>) {
  // `createElement` rather than `<Icon />` from a local: binding a component to a
  // variable during render is exactly what `react-hooks/static-components`
  // forbids, and the lookup can't be hoisted since it depends on a prop.
  return createElement(categoryIcon(category), { className, "aria-hidden": true });
}
