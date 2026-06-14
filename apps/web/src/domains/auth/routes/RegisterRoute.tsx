import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { useAuth } from "../hooks/useAuth";

export function RegisterRoute() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ name: name || undefined, email, password });
      navigate("/");
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 360, margin: "4rem auto" }}>
      <h1>{t("auth.createAccount")}</h1>
      <form onSubmit={onSubmit}>
        <input type="text" placeholder={t("auth.name")} value={name}
          onChange={(e) => setName(e.target.value)} />
        <input type="email" placeholder={t("auth.email")} value={email} required
          onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder={t("auth.password")} value={password} required minLength={8}
          onChange={(e) => setPassword(e.target.value)} />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>{t("auth.createAccount")}</button>
      </form>
      <p>
        {t("auth.haveAccount")} <Link to="/login">{t("auth.signIn")}</Link>
      </p>
    </main>
  );
}
