import { useTranslation } from "react-i18next";

import type { auth } from "@finance/contracts";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCurrencies } from "../../reference/hooks/useReference";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Select } from "../../../shared/ui/select";
import { Switch } from "../../../shared/ui/switch";
import { useTheme } from "../../../theme/useTheme";
import { useProfileMutations } from "../hooks/useProfile";

const SUPPORTED_CURRENCIES: auth.CurrentUser["preferredCurrency"][] = ["CLP", "USD", "CLF"];
const DATE_FORMATS: auth.CurrentUser["dateFormat"][] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

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
        <Select
          className="h-8 w-40"
          value={user.preferredCurrency}
          options={currencyOptions}
          onChange={(e) =>
            updatePreferences.mutate({
              preferredCurrency: e.target.value as auth.CurrentUser["preferredCurrency"],
            })
          }
        />
      </div>
      <div className="flex items-center justify-between border-b py-3">
        <span className="text-sm">{t("profile.preferences.language")}</span>
        <Select
          className="h-8 w-32"
          value={user.locale}
          options={[
            { value: "es", label: "Español" },
            { value: "en", label: "English" },
          ]}
          onChange={(e) => handleLocaleChange(e.target.value as auth.CurrentUser["locale"])}
        />
      </div>
      <div className="flex items-center justify-between py-3">
        <span className="text-sm">{t("profile.preferences.dateFormat")}</span>
        <Select
          className="h-8 w-36"
          value={user.dateFormat}
          options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
          onChange={(e) =>
            updatePreferences.mutate({
              dateFormat: e.target.value as auth.CurrentUser["dateFormat"],
            })
          }
        />
      </div>
    </CollapsibleSection>
  );
}
