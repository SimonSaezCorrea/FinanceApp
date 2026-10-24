import type { reference } from "@finance/contracts";

import { accountsApi } from "../../accounts/api/accountsApi";
import { debtsApi } from "../../debts/api/debtsApi";
import { installmentsApi } from "../../installments/api/installmentsApi";
import { recurringApi } from "../../recurring/api/recurringApi";
import { savingsApi } from "../../savings/api/savingsApi";
import { transactionsApi } from "../../transactions/api/transactionsApi";
import type { TemplateRefs } from "./buildTemplate";
import type { ExistingData } from "./templateData";

/**
 * Every financial record the user has, as the API returns it: what the pre-filled template
 * writes on its sheets and what "Descargar mis datos" (Perfil → Datos y privacidad) exports.
 * `GET /transactions` without a limit returns every movement.
 */
export async function loadExistingData(categories: reference.Category[]): Promise<ExistingData> {
  const [accounts, txPage, debts, plans, recurring, goals, entries] = await Promise.all([
    accountsApi.list(),
    transactionsApi.list(),
    debtsApi.list(),
    installmentsApi.list(),
    recurringApi.list(),
    savingsApi.listGoals(),
    savingsApi.listEntries(),
  ]);
  const statements = (
    await Promise.all(
      accounts
        .filter((a) => a.type === "CREDIT_CARD")
        .map((a) => accountsApi.creditStatements(a.id)),
    )
  ).flat();
  return {
    statements,
    accounts,
    transactions: txPage.items,
    debts,
    plans,
    recurring,
    goals,
    entries,
    categories,
  };
}

/** The template's dropdown lists: the ACTIVE accounts and their cards (an inactive one takes
 * no new rows), the catalogue, the currencies and the institutions. */
export function templateRefs(input: {
  accounts: ExistingData["accounts"];
  categories: reference.Category[];
  currencies: string[];
  institutions: { id: string; name: string }[];
  customFields?: TemplateRefs["customFields"];
}): TemplateRefs {
  const active = input.accounts.filter((a) => a.status !== "INACTIVE");
  return {
    accounts: active.map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency })),
    cards: active.flatMap((a) =>
      (a.cards ?? []).map((c) => ({
        id: c.id,
        accountId: a.id,
        accountName: a.name,
        last4: c.last4,
      })),
    ),
    categories: input.categories,
    // The user's own currencies plus any an account already uses.
    currencies: [...new Set([...input.currencies, ...active.map((a) => a.currency)])],
    institutions: input.institutions,
    customFields: input.customFields ?? [],
  };
}
