"use client";

import { useLocale, useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LoginForm({ googleConfigured }: { googleConfigured: boolean }) {
  const t = useTranslations("auth.loginForm");
  const locale = useLocale();
  const [email, setEmail] = useState("dev@example.com");
  const [busy, setBusy] = useState<string | null>(null);
  const dashboardUrl = `/${locale}/dashboard`;

  return (
    <div className="space-y-4">
      <Button
        className="w-full"
        disabled={busy !== null || !googleConfigured}
        onClick={async () => {
          setBusy("google");
          try {
            await signIn("google", { callbackUrl: dashboardUrl });
          } finally {
            setBusy(null);
          }
        }}
      >
        {busy === "google" ? t("redirecting") : t("continueGoogle")}
      </Button>
      {!googleConfigured ? (
        <p className="text-xs text-muted-foreground">{t("googleEnvHint")}</p>
      ) : null}
      {process.env.NODE_ENV !== "production" && (
        <form
          className="space-y-3 rounded-md border bg-muted/40 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("dev");
            try {
              await signIn("dev-credentials", {
                email,
                callbackUrl: dashboardUrl,
              });
            } finally {
              setBusy(null);
            }
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("devOnly")}
          </p>
          <label className="block space-y-1 text-sm">
            <span>{t("emailLabel")}</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              type="email"
              required
            />
          </label>
          <Button type="submit" variant="outline" className="w-full" disabled={busy !== null}>
            {busy === "dev" ? t("signingIn") : t("devSignIn")}
          </Button>
        </form>
      )}
    </div>
  );
}
