import type { investments } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const investmentsApi = {
  list: () => apiFetch<investments.Investment[]>("/investments"),

  create: (body: investments.CreateInvestment) =>
    apiFetch<investments.Investment>("/investments", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: investments.UpdateInvestment) =>
    apiFetch<investments.Investment>(`/investments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (id: string) => apiFetch<void>(`/investments/${id}`, { method: "DELETE" }),
};
