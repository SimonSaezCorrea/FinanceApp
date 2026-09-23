import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { Card, CardContent, CardHeader, CardTitle } from "../../../shared/ui/card";
import { SidePanel } from "../../../shared/ui/overlay";
import { ThemeToggle } from "../../../shared/ui/theme-toggle";
import { LoginForm, type LoginStep } from "../components/LoginForm";
import { RegisterForm } from "../components/RegisterForm";

export function LoginRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [registerOpen, setRegisterOpen] = useState(false);

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{step === "credentials" ? t("auth.signIn") : t("auth.mfa.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm onSuccess={() => navigate("/")} onStepChange={setStep} />
          {step === "credentials" ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t("auth.needAccount")}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setRegisterOpen(true)}
              >
                {t("auth.register")}
              </button>
            </p>
          ) : null}
        </CardContent>
      </Card>
      <SidePanel open={registerOpen} onOpenChange={setRegisterOpen} title={t("auth.createAccount")}>
        <RegisterForm
          onSuccess={() => {
            setRegisterOpen(false);
            navigate("/");
          }}
        />
      </SidePanel>
    </main>
  );
}
