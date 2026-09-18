import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCurrencies } from "../../reference/hooks/useReference";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Switch } from "../../../shared/ui/switch";
import { useProfileMutations } from "../hooks/useProfile";

export function FinancialCustomizationSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: currencies } = useCurrencies();
  const { updatePreferences } = useProfileMutations();

  if (!user) return null;

  function currencyLabel(code: string): string {
    const known = currencies?.find((c) => c.code === code);
    return known ? `${known.code} · ${known.name}` : code;
  }

  function addCurrency(code: string) {
    if (!code || user!.extraCurrencies.includes(code)) return;
    updatePreferences.mutate({ extraCurrencies: [...user!.extraCurrencies, code] });
  }

  function removeCurrency(code: string) {
    updatePreferences.mutate(
      { extraCurrencies: user!.extraCurrencies.filter((c) => c !== code) },
      {
        onError: (err) => {
          const errCode = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
          toast.error(t(`errors.${errCode}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
        },
      },
    );
  }

  const addableCurrencies = (currencies ?? []).filter(
    (c) => c.code !== user.preferredCurrency && !user.extraCurrencies.includes(c.code),
  );
  const noMoreCurrencies = addableCurrencies.length === 0;

  return (
    <CollapsibleSection title={t("profile.financial.title")}>
      <div className="border-b py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm">{t("profile.financial.extraCurrencies")}</div>
            <div className="text-xs text-muted-foreground">
              {t("profile.financial.extraCurrenciesHint")}
            </div>
          </div>
          <SearchableSelect
            variant="inline"
            className="shrink-0"
            value=""
            placeholder={t(
              noMoreCurrencies
                ? "profile.financial.noMoreCurrencies"
                : "profile.financial.addCurrencyPlaceholder",
            )}
            disabled={noMoreCurrencies}
            options={addableCurrencies.map((c) => ({
              value: c.code,
              label: `${c.code} · ${c.name}`,
            }))}
            searchPlaceholder={t("common.search")}
            noResultsLabel={t("common.noResults")}
            aria-label={t("profile.financial.extraCurrencies")}
            onChange={addCurrency}
          />
        </div>
        {user.extraCurrencies.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
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
          <p className="mt-2 text-xs text-muted-foreground">
            {t("profile.financial.noExtraCurrencies")}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between py-3">
        <div>
          <div className="text-sm">{t("profile.financial.hideBalances")}</div>
          <div className="text-xs text-muted-foreground">
            {t("profile.financial.hideBalancesHint")}
          </div>
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
