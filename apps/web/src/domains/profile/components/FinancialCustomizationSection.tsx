import { Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCurrencies } from "../../reference/hooks/useReference";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import { Switch } from "../../../shared/ui/switch";
import { useProfileMutations } from "../hooks/useProfile";

const CYCLE_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function FinancialCustomizationSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: currencies } = useCurrencies();
  const { updatePreferences } = useProfileMutations();
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(user?.monthlyBudgetTarget ?? "");
  const [addingCurrency, setAddingCurrency] = useState("");
  // Local-only placeholder — no transaction-rounding logic exists yet (see PENDING.md).
  const [roundUp, setRoundUp] = useState(false);

  if (!user) return null;

  function currencyLabel(code: string): string {
    const known = currencies?.find((c) => c.code === code);
    return known ? `${known.code} · ${known.name}` : code;
  }

  function saveBudget() {
    const trimmed = budgetInput.trim();
    if (trimmed === "") {
      updatePreferences.mutate({ monthlyBudgetTarget: null });
    } else if (/^\d+(\.\d+)?$/.test(trimmed)) {
      updatePreferences.mutate({ monthlyBudgetTarget: trimmed });
    }
    setEditingBudget(false);
  }

  function addCurrency() {
    if (!addingCurrency || user!.extraCurrencies.includes(addingCurrency)) return;
    updatePreferences.mutate({ extraCurrencies: [...user!.extraCurrencies, addingCurrency] });
    setAddingCurrency("");
  }

  function removeCurrency(code: string) {
    updatePreferences.mutate({ extraCurrencies: user!.extraCurrencies.filter((c) => c !== code) });
  }

  const addableCurrencies = (currencies ?? []).filter(
    (c) => c.code !== user.preferredCurrency && !user.extraCurrencies.includes(c.code),
  );

  return (
    <CollapsibleSection title={t("profile.financial.title")}>
      <div className="flex items-center justify-between border-b py-3">
        <div>
          <div className="text-sm">{t("profile.financial.cycleStart")}</div>
          <div className="text-xs text-muted-foreground">{t("profile.financial.cycleStartHint")}</div>
        </div>
        <Select
          className="h-8 w-20"
          value={String(user.billingCycleStartDay ?? 1)}
          options={CYCLE_DAYS.map((d) => ({ value: String(d), label: String(d) }))}
          onChange={(e) => updatePreferences.mutate({ billingCycleStartDay: Number(e.target.value) })}
        />
      </div>

      <div className="flex items-center justify-between border-b py-3">
        <div>
          <div className="text-sm">{t("profile.financial.budgetTarget")}</div>
          <div className="text-xs text-muted-foreground">{t("profile.financial.budgetTargetHint")}</div>
        </div>
        {editingBudget ? (
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-32 text-right"
              inputMode="decimal"
              autoFocus
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveBudget()}
              onBlur={saveBudget}
            />
          </div>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium tabular-nums text-muted-foreground hover:text-foreground"
            onClick={() => {
              setBudgetInput(user.monthlyBudgetTarget ?? "");
              setEditingBudget(true);
            }}
          >
            {user.monthlyBudgetTarget
              ? formatMoney(user.monthlyBudgetTarget, {
                  locale: i18n.language,
                  currency: user.preferredCurrency,
                })
              : t("profile.personalInfo.notSet")}
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>

      <div className="border-b py-3">
        <div className="mb-2">
          <div className="text-sm">{t("profile.financial.extraCurrencies")}</div>
          <div className="text-xs text-muted-foreground">{t("profile.financial.extraCurrenciesHint")}</div>
        </div>
        <div className="mb-2 flex gap-2">
          <Select
            className="h-8 flex-1"
            value={addingCurrency}
            options={[
              { value: "", label: t("profile.financial.addCurrencyPlaceholder") },
              ...addableCurrencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })),
            ]}
            onChange={(e) => setAddingCurrency(e.target.value)}
          />
          <button
            type="button"
            onClick={addCurrency}
            disabled={!addingCurrency}
            className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-input px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("profile.financial.addCurrency")}
          </button>
        </div>
        {user.extraCurrencies.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {user.extraCurrencies.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary"
              >
                {currencyLabel(code)}
                <button
                  type="button"
                  onClick={() => removeCurrency(code)}
                  aria-label={t("profile.financial.removeCurrency", { code })}
                  className="text-primary/70 hover:text-primary"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("profile.financial.noExtraCurrencies")}</p>
        )}
      </div>

      <div className="flex items-center justify-between border-b py-3">
        <div>
          <div className="text-sm">{t("profile.financial.roundUp")}</div>
          <div className="text-xs text-muted-foreground">{t("profile.financial.roundUpHint")}</div>
        </div>
        <Switch checked={roundUp} onCheckedChange={setRoundUp} aria-label={t("profile.financial.roundUp")} />
      </div>

      <div className="flex items-center justify-between py-3">
        <div>
          <div className="text-sm">{t("profile.financial.hideBalances")}</div>
          <div className="text-xs text-muted-foreground">{t("profile.financial.hideBalancesHint")}</div>
        </div>
        <Switch
          checked={user.hideBalances}
          onCheckedChange={(checked) => updatePreferences.mutate({ hideBalances: checked })}
          aria-label={t("profile.financial.hideBalances")}
        />
      </div>
    </CollapsibleSection>
  );
}
