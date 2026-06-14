import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

/** Gates routes behind authentication; redirects to /login when signed out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) return <p>{t("app.loading")}</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
