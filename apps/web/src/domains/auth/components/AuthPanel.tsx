import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../shared/ui/button";
import { SidePanel } from "../../../shared/ui/overlay";
import type { AuthPanelMode } from "../lib/authRedirect";
import { LoginForm, type LoginStep } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

export type { AuthPanelMode } from "../lib/authRedirect";

const REGISTER_FORM_ID = "auth-register-form";

interface AuthPanelProps {
  /** `null` = closed; otherwise the view the panel shows. */
  mode: AuthPanelMode | null;
  onModeChange: (mode: AuthPanelMode | null) => void;
  /** A session exists (login, passkey, MFA or a fresh registration). */
  onAuthenticated: () => void;
}

/**
 * Access as a side panel (a full-screen window on a phone), the only entry point to either
 * form — `/login` and `/register` redirect here. Passkey-first: the header is just the close
 * control, and each view leads with its own heading. Login and sign-up switch through a link
 * at the foot of each; the RUT typed in one is kept in the other.
 */
export function AuthPanel({ mode, onModeChange, onAuthenticated }: Readonly<AuthPanelProps>) {
  const { t } = useTranslation();
  const [loginStep, setLoginStep] = useState<LoginStep>("credentials");
  const [identifierValue, setIdentifierValue] = useState("");
  const [registerBusy, setRegisterBusy] = useState(false);
  const active = mode ?? "login";
  const isLogin = active === "login";

  let title = t("auth.createAccount");
  if (isLogin) title = loginStep === "mfa" ? t("auth.mfa.title") : t("auth.signIn");

  const switchLink = isLogin ? (
    <p className="text-center text-base text-muted-foreground">
      {t("auth.firstTime")}{" "}
      <button
        type="button"
        className="font-semibold text-primary hover:underline"
        onClick={() => onModeChange("register")}
      >
        {t("auth.createAccount")}
      </button>
    </p>
  ) : (
    <p className="text-center text-base text-muted-foreground">
      {t("auth.haveAccount")}{" "}
      <button
        type="button"
        className="font-semibold text-primary hover:underline"
        onClick={() => onModeChange("login")}
      >
        {t("auth.signIn")}
      </button>
    </p>
  );

  return (
    <SidePanel
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) {
          onModeChange(null);
          setLoginStep("credentials");
        }
      }}
      // Each view carries its own visible heading; the dialog still needs a name.
      title={<span className="sr-only">{title}</span>}
      footer={
        isLogin ? undefined : (
          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              form={REGISTER_FORM_ID}
              variant="accent"
              size="lg"
              disabled={registerBusy}
              className="w-full"
            >
              {registerBusy ? t("auth.creatingAccount") : t("auth.createAccount")}
            </Button>
            {switchLink}
          </div>
        )
      }
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-8 py-2 sm:py-6">
        {isLogin ? (
          <LoginForm
            onSuccess={onAuthenticated}
            onStepChange={setLoginStep}
            identifierValue={identifierValue}
            onIdentifierValueChange={setIdentifierValue}
          />
        ) : (
          <RegisterForm
            onSuccess={onAuthenticated}
            identifierValue={identifierValue}
            onIdentifierValueChange={setIdentifierValue}
            formId={REGISTER_FORM_ID}
            onBusyChange={setRegisterBusy}
          />
        )}
        {isLogin && loginStep === "credentials" ? switchLink : null}
      </div>
    </SidePanel>
  );
}
