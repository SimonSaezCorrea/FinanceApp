import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { useAuth } from "../hooks/useAuth";

export function LoginRoute() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
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
      <h1>{t("auth.signIn")}</h1>
      <form onSubmit={onSubmit}>
        <input type="email" placeholder={t("auth.email")} value={email} required
          onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder={t("auth.password")} value={password} required
          onChange={(e) => setPassword(e.target.value)} />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>{t("auth.signIn")}</button>
      </form>
      <p>
        {t("auth.needAccount")} <Link to="/register">{t("auth.register")}</Link>
      </p>
    </main>
  );
}
