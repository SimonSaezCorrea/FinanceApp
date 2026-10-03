import type { auth } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const consentsApi = {
  list: () => apiFetch<auth.ListConsentsResponse>("/auth/me/consents"),
};
