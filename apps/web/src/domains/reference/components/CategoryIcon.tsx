import { CategoryCodeIcon } from "../../../shared/ui/category-icon";
import { useCategoryCatalog } from "../hooks/useCategoryCatalog";

interface Props {
  /** A movement/plan/series' `categoryId` — resolved against the catalogue. */
  categoryId: string | null | undefined;
  className?: string;
}

/** The icon of a stored category, by id. */
export function CategoryIcon({ categoryId, className }: Readonly<Props>) {
  const { codeOf } = useCategoryCatalog();
  return <CategoryCodeIcon code={codeOf(categoryId)} className={className} />;
}
