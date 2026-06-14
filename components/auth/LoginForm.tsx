"use client";

import { useLocale, useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

export function LoginForm({ googleConfigured }: { googleConfigured: boolean }) {
  const t = useTranslations("auth.loginForm");
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dashboardUrl = `/${locale}/dashboard`;

  return (
    <div className="space-y-4">
      {googleConfigured ? (
        <>
          <Button
            className="w-full"
            disabled={busy !== null}
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
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy("credentials");
          setError(null);
          try {
            const res = await signIn("credentials", {
              email,
              password,
              redirect: false,
            });
            if (res?.error) {
              setError(t("invalidCredentials"));
              return;
            }
            router.replace("/dashboard");
            router.refresh();
          } finally {
            setBusy(null);
          }
        }}
      >
        <label className="block space-y-1 text-sm">
          <span>{t("emailLabel")}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("passwordLabel")}</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy !== null}>
          {busy === "credentials" ? t("signingIn") : t("signIn")}
        </Button>
      </form>
    </div>
  );
}
