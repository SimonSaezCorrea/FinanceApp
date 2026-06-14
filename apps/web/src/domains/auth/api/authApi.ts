import type { auth } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const authApi = {
  register: (body: auth.RegisterRequest) =>
    apiFetch<auth.CurrentUser>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: auth.LoginRequest) =>
    apiFetch<auth.CurrentUser>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => apiFetch<auth.CurrentUser>("/auth/me"),

  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
};
