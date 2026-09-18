import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { useAuth } from "../../auth/hooks/useAuth";

/**
 * Wraps a monetary display; renders a mask instead when the user's `hideBalances`
 * preference is on. Real, persisted preference, wired into Panel, an account's own
 * balance, the Cuentas list and Ahorros (specs/020) — deliberately NOT every money
 * label app-wide (Movimientos, Deudas, Recurrentes, Cuotas/Facturación stay
 * unmasked, see spec FR-014).
 *
 * A masked amount can be revealed temporarily: a click/tap toggles it (like a
 * password-reveal field, and marked with the same eye/eye-off affordance so the
 * toggle is discoverable, not just a lucky click), independently per instance —
 * several amounts can be revealed at once, and revealing one never affects
 * another. The `revealed` state is local React state, so it resets naturally on
 * navigation away from the view (specs/020 edge case: re-entering a view always
 * starts masked again).
 *
 * Many call sites nest this inside a larger clickable element (an account
 * card's own `<Link>` to its detail route, a savings row's swipe-to-open
 * tap handler, …) — the reveal toggle takes priority over that outer
 * interaction, never triggering it. `stopPropagation` keeps the click from
 * ever reaching the ancestor's own handler, and `preventDefault` guards the
 * case where the ancestor is a real `<a>` (its navigation is the browser's
 * own default action, not a React handler `stopPropagation` alone would miss).
 */
export function MaskedAmount({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  const [revealed, setRevealed] = useState(false);

  if (!user?.hideBalances) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setRevealed((r) => !r);
      }}
      aria-pressed={revealed}
      className="font-inherit text-inherit inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0"
    >
      {revealed ? children : <span aria-hidden="true">••••••</span>}
      {revealed ? (
        <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}
