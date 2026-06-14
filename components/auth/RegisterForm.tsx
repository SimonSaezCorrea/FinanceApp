"use client";

import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

export function RegisterForm() {
  const t = useTranslations("auth.registerForm");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 text-left"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name || undefined, email, password }),
          });

          if (res.status === 409) {
            setError(t("emailTaken"));
            return;
          }
          if (!res.ok) {
            setError(t("genericError"));
            return;
          }

          const login = await signIn("credentials", {
            email,
            password,
            redirect: false,
          });
          if (login?.error) {
            setError(t("genericError"));
            return;
          }
          router.replace("/dashboard");
          router.refresh();
        } catch {
          setError(t("genericError"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>{t("nameLabel")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          type="text"
          autoComplete="name"
        />
      </label>
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
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="text-xs text-muted-foreground">{t("passwordHint")}</span>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t("creating") : t("createAccount")}
      </Button>
    </form>
  );
}
