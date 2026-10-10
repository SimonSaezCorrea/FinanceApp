import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

/**
 * The item a list screen has open in its detail panel, which a link from elsewhere can choose:
 * `/debts?debt=<id>` opens that debt (a movement's "Ver deuda" lands on the debt, not on the
 * list). The parameter is read once and dropped from the URL, so closing the panel and reloading
 * doesn't open it again — after that the selection is ordinary local state.
 */
export function useLinkedSelection(param: string): [string | null, (id: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const linked = searchParams.get(param);
  const [selected, setSelected] = useState<string | null>(linked);
  // A new link while the screen is already open (the parameter changed): follow it, adjusting the
  // state during render rather than in an effect.
  const [seen, setSeen] = useState<string | null>(linked);
  if (linked !== seen) {
    setSeen(linked);
    if (linked) setSelected(linked);
  }

  useEffect(() => {
    if (!linked) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(param);
        return next;
      },
      { replace: true },
    );
  }, [linked, param, setSearchParams]);

  return [selected, setSelected];
}

/** Where a link to one item of a list screen goes: the screen, with that item's detail open. */
export const linkTo = {
  debt: (id: string) => `/debts?debt=${id}`,
  installmentPlan: (id: string) => `/installments?plan=${id}`,
  recurring: (id: string) => `/recurring?recurring=${id}`,
  savingsGoal: (id: string) => `/savings?goal=${id}`,
  savingsEntry: (id: string) => `/savings?entry=${id}`,
};
