import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { withBrand } from "@finance/ui/src/shared/lib/brand";
import { Button } from "@finance/ui/src/shared/ui/button";

import { saveFile } from "../../../shared/lib/saveFile";
import { Segmented } from "../../../shared/ui/segmented";
import { buildTemplate } from "../../import/lib/buildTemplate";
import { templateRefs } from "../../import/lib/loadExistingData";
import { existingRows } from "../../import/lib/templateData";
import { useAllowedCurrencies } from "../../reference/hooks/useAllowedCurrencies";
import { useCategories, useInstitutions } from "../../reference/hooks/useReference";
import {
  exportFileDate,
  loadPersonalData,
  personalDataJson,
  personalSheets,
  type PersonalDataFormat,
} from "../lib/personalData";

/**
 * "Descargar mis datos" (Ley 21.719, portability): everything fik keeps about the person, in
 * the format they pick. Excel = the pre-filled import template (it can be uploaded again)
 * plus the profile, emails, consents, sessions and passkeys; JSON = every record exactly as
 * the API returns it, for another program. Built in the browser from the app's own endpoints.
 */
export function PersonalDataExportSection() {
  const { t, i18n } = useTranslation();
  const categories = useCategories();
  const institutions = useInstitutions("CL");
  const allowedCurrencies = useAllowedCurrencies();
  const [format, setFormat] = useState<PersonalDataFormat>("xlsx");
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const now = new Date();
      const data = await loadPersonalData(categories.data ?? []);
      const name = `${t("profile.export.fileName")}-${exportFileDate(now)}`;
      if (format === "json") {
        saveFile(
          new Blob([personalDataJson(data, now)], { type: "application/json" }),
          `${name}.json`,
        );
      } else {
        const blob = await buildTemplate({
          refs: templateRefs({
            accounts: data.financial.accounts,
            categories: categories.data ?? [],
            currencies: allowedCurrencies.map((c) => c.code),
            institutions: (institutions.data ?? []).map((i) => ({ id: i.id, name: i.name })),
          }),
          t,
          locale: i18n.language,
          existing: existingRows(data.financial, t),
          extraSheets: personalSheets(data, t),
        });
        saveFile(blob, `${name}.xlsx`);
      }
    } catch {
      toast.error(t("profile.export.error"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section
      aria-labelledby="profile-export-title"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="profile-export-title" className="text-base font-semibold">
          {t("profile.export.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {withBrand(t("profile.export.description"))}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Segmented
          aria-label={t("profile.export.formatLabel")}
          value={format}
          onChange={setFormat}
          variant="neutral"
          options={[
            { value: "xlsx", label: t("profile.export.formats.xlsx.label") },
            { value: "json", label: t("profile.export.formats.json.label") },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {withBrand(t(`profile.export.formats.${format}.hint`))}
        </p>
      </div>

      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={downloading || !categories.data}
          onClick={download}
        >
          <Download className="h-4 w-4" aria-hidden />
          {downloading ? t("profile.export.downloading") : t("profile.export.download")}
        </Button>
      </div>
    </section>
  );
}
