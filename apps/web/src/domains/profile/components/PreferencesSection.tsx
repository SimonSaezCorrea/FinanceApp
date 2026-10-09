import { useTranslation } from "react-i18next";

import type { auth } from "@finance/contracts";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCurrencies } from "../../reference/hooks/useReference";
import { SearchableSelect } from "@finance/ui/src/shared/ui/searchable-select";
import { ThemeSegmented } from "@finance/ui/src/shared/ui/theme-segmented";
import { useProfileMutations } from "../hooks/useProfile";
import { FinancialCustomizationSection } from "./FinancialCustomizationSection";

const SUPPORTED_CURRENCIES: auth.CurrentUser["preferredCurrency"][] = ["CLP", "USD", "CLF"];

/**
 * Preferences (specs/029): "Apariencia e idioma" (theme with all three options, language) and
 * "Monedas y montos" (main currency, extra currencies, hide balances). Each control saves at once,
 * so nothing here can hold unsaved changes.
 */
export function PreferencesSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: currencies } = useCurrencies();
  const { updatePreferences } = useProfileMutations();

  if (!user) return null;

  const currencyOptions = SUPPORTED_CURRENCIES.map((code) => {
    const known = currencies?.find((c) => c.code === code);
    return { value: code, label: known ? `${known.code} · ${known.name}` : code };
  });

  async function handleLocaleChange(locale: auth.CurrentUser["locale"]) {
    await i18n.changeLanguage(locale);
    updatePreferences.mutate({ locale });
  }

  return (
    <>
      <section
        aria-labelledby="profile-pref-appearance"
        className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
      >
        <h2 id="profile-pref-appearance" className="text-base font-semibold">
          {t("profile.preferences.blocks.appearance")}
        </h2>
        <div className="flex flex-col gap-2">
          <span className="text-sm">{t("theme.label")}</span>
          <ThemeSegmented />
        </div>
        <div className="flex min-h-14 items-center justify-between gap-4 border-t pt-3">
          <span className="text-sm">{t("profile.preferences.language")}</span>
          <SearchableSelect
            variant="inline"
            value={user.locale}
            options={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
            searchPlaceholder={t("common.search")}
            noResultsLabel={t("common.noResults")}
            aria-label={t("profile.preferences.language")}
            onChange={(v) => handleLocaleChange(v as auth.CurrentUser["locale"])}
          />
        </div>
      </section>

      <section
        aria-labelledby="profile-pref-money"
        className="flex flex-col rounded-2xl border bg-card p-5"
      >
        <h2 id="profile-pref-money" className="pb-1 text-base font-semibold">
          {t("profile.preferences.blocks.money")}
        </h2>
        <div className="flex min-h-14 items-center justify-between gap-4 border-b py-3">
          <span className="text-sm">{t("profile.preferences.currency")}</span>
          <SearchableSelect
            variant="inline"
            value={user.preferredCurrency}
            options={currencyOptions}
            displayValue={user.preferredCurrency}
            searchPlaceholder={t("common.search")}
            noResultsLabel={t("common.noResults")}
            aria-label={t("profile.preferences.currency")}
            onChange={(v) =>
              updatePreferences.mutate({
                preferredCurrency: v as auth.CurrentUser["preferredCurrency"],
              })
            }
          />
        </div>
        <FinancialCustomizationSection />
      </section>
    </>
  );
}
