import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { Card, CardContent, CardHeader, CardTitle } from "../../../shared/ui/card";
import { ThemeToggle } from "../../../shared/ui/theme-toggle";
import { RegisterForm } from "../components/RegisterForm";

/** The standalone page for direct navigation, bookmarks and password-manager autofill —
 * `LoginRoute`'s own "Registrarse" opens the same `RegisterForm` in a side panel instead of
 * navigating here, but this route has to keep working for anyone who lands on it directly. */
export function RegisterRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("auth.createAccount")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RegisterForm onSuccess={() => navigate("/")} />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t("auth.signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
