import { useTranslation } from "react-i18next";

import type { auth } from "@finance/contracts";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCurrencies } from "../../reference/hooks/useReference";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Switch } from "../../../shared/ui/switch";
import { useTheme } from "../../../theme/useTheme";
import { useProfileMutations } from "../hooks/useProfile";

const SUPPORTED_CURRENCIES: auth.CurrentUser["preferredCurrency"][] = ["CLP", "USD", "CLF"];

export function PreferencesSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { mode, setMode } = useTheme();
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
    <CollapsibleSection title={t("profile.preferences.title")}>
      <div className="flex items-center justify-between border-b py-3">
        <span className="text-sm">{t("profile.preferences.darkTheme")}</span>
        <Switch
          checked={mode === "dark"}
          onCheckedChange={(checked) => setMode(checked ? "dark" : "light")}
          aria-label={t("profile.preferences.darkTheme")}
        />
      </div>
      <div className="flex items-center justify-between border-b py-3">
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
      <div className="flex items-center justify-between py-3">
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
    </CollapsibleSection>
  );
}
