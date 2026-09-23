import { useState } from "react";
import { useTranslation } from "react-i18next";

import { SidePanel } from "../../../shared/ui/overlay";
import { Tabs } from "../../../shared/ui/tabs";
import { LoginForm, type LoginStep } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

export type AuthPanelMode = "login" | "register";

interface AuthPanelProps {
  /** `null` = closed; otherwise the tab the panel opens on. */
  mode: AuthPanelMode | null;
  onModeChange: (mode: AuthPanelMode | null) => void;
  /** A session exists (login, passkey, MFA or a fresh registration). */
  onAuthenticated: () => void;
}

/** Access as a side panel instead of a page: "Iniciar sesión" and "Crear cuenta" as two tabs
 * over the same real forms `/login` and `/register` use. Opened from the public landing so a
 * visitor never leaves the page they were reading to sign in. */
export function AuthPanel({ mode, onModeChange, onAuthenticated }: Readonly<AuthPanelProps>) {
  const { t } = useTranslation();
  const [loginStep, setLoginStep] = useState<LoginStep>("credentials");
  const active = mode ?? "login";
  const isLogin = active === "login";

  let title = t("auth.createAccount");
  if (isLogin) title = loginStep === "mfa" ? t("auth.mfa.title") : t("auth.signIn");

  return (
    <SidePanel
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) {
          onModeChange(null);
          setLoginStep("credentials");
        }
      }}
      eyebrow={t("landing.auth.eyebrow")}
      title={title}
      description={
        isLogin ? t("landing.auth.loginDescription") : t("landing.auth.registerDescription")
      }
    >
      <div className="flex flex-col gap-4">
        {loginStep === "credentials" ? (
          <Tabs<AuthPanelMode>
            value={active}
            onChange={onModeChange}
            items={[
              { value: "login", label: t("auth.signIn") },
              { value: "register", label: t("auth.createAccount") },
            ]}
          />
        ) : null}

        {isLogin ? (
          <LoginForm onSuccess={onAuthenticated} onStepChange={setLoginStep} />
        ) : (
          <RegisterForm onSuccess={onAuthenticated} />
        )}

        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-sm font-medium">{t("landing.auth.cashTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("landing.auth.cashBody")}</p>
        </div>
      </div>
    </SidePanel>
  );
}
