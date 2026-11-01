import type { movementTemplates } from "@finance/contracts";

import { apiFetch } from "@finance/client";

/** The person's movement templates (specs/037). Using one creates nothing here: the
 * movement form is pre-filled and saved with `POST /transactions`. */
export const movementTemplatesApi = {
  list: () => apiFetch<movementTemplates.MovementTemplate[]>("/movement-templates"),

  create: (body: movementTemplates.SaveMovementTemplate) =>
    apiFetch<movementTemplates.MovementTemplate>("/movement-templates", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  replace: (id: string, body: movementTemplates.SaveMovementTemplate) =>
    apiFetch<movementTemplates.MovementTemplate>(`/movement-templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  remove: (id: string) => apiFetch<void>(`/movement-templates/${id}`, { method: "DELETE" }),
};
