import { MailWarning } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiRequestError, authApi } from "@finance/client";
import { Button } from "@finance/ui/src/shared/ui/button";

import { useAuth } from "../domains/auth/hooks/useAuth";

/**
 * "Confirma tu correo" (specs/032 US1): shown while the account's address is unconfirmed. The app
 * works the same meanwhile; only recovering the password by email and the security notices wait
 * for it. "Reenviar" answers with what happened, never silently.
 */
export function EmailVerificationBanner() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (!user || user.emailVerified) return null;

  async function resend() {
    setBusy(true);
    setResult(null);
    try {
      await authApi.resendVerification();
      setResult({ tone: "ok", text: t("app.emailVerification.sent", { address: user!.email }) });
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      // Confirmed in another tab meanwhile: the banner just goes away.
      if (code === "EMAIL_ALREADY_VERIFIED") await refreshUser();
      else setResult({ tone: "error", text: t(`errors.${code}`) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="region"
      aria-label={t("app.emailVerification.title")}
      className="mb-5 flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <MailWarning className="hidden size-5 shrink-0 text-warning sm:block" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium">{t("app.emailVerification.title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("app.emailVerification.body", { address: user.email })}
        </p>
        {result ? (
          <p
            role={result.tone === "error" ? "alert" : "status"}
            className={
              result.tone === "error" ? "text-xs text-destructive" : "text-xs text-success"
            }
          >
            {result.text}
          </p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start sm:self-auto"
        disabled={busy}
        onClick={() => void resend()}
      >
        {busy ? t("app.emailVerification.sending") : t("app.emailVerification.resend")}
      </Button>
    </div>
  );
}
