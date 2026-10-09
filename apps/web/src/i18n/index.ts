import { createI18n } from "@finance/i18n";
import { initReactI18next } from "react-i18next";

// The catalogs live in `@finance/i18n`, shared with the public site; keys stay in parity across
// es/en (Constitution Principle III, enforced by that package's parity test).
const i18n = createI18n({ lng: "es", plugins: [initReactI18next] });

export default i18n;
