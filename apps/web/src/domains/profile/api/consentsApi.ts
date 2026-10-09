import type { auth } from "@finance/contracts";

import { apiFetch } from "@finance/client";

export const consentsApi = {
  list: () => apiFetch<auth.ListConsentsResponse>("/auth/me/consents"),
};
