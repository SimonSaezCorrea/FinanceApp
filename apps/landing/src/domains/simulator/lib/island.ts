import { landingCatalogs } from "../../../i18n";
import type { Language } from "../../../lib/language";
import type { SimulatorIsland } from "./translate";

export type { SimulatorIsland } from "./translate";

/**
 * Spec 034 (build time only: it reads the catalogs) — what the page script needs and can't import:
 * the language and the message templates under `landing.simulator` (results, systems, cash, errors
 * and the stamp-tax hints), as JSON in a `<script type="application/json" id="simulator-data">`.
 * The script fills `{{…}}` itself (`translate.ts`).
 */
export function simulatorIsland(lang: Language): SimulatorIsland {
  const sim = landingCatalogs[lang].landing.simulator;
  return {
    lang,
    messages: {
      results: sim.results,
      system: sim.system,
      cash: sim.cash,
      errors: sim.errors,
      form: { stampTaxHint: sim.form.stampTaxHint, stampTaxDiffers: sim.form.stampTaxDiffers },
    },
  };
}

/** JSON safe inside a `<script>` element (no `</script>` can close it early). */
export function islandJson(island: SimulatorIsland): string {
  return JSON.stringify(island).replace(/</g, "\\u003c");
}
