import { createContext, useContext } from "react";

import type { AuthPanelMode } from "../../auth/components/AuthPanel";

export const LandingAuthContext = createContext<(mode: AuthPanelMode) => void>(() => {});

/** Opens the landing's access panel from anywhere inside it ("Crear cuenta" CTAs). */
export function useOpenAuth() {
  return useContext(LandingAuthContext);
}
