import { createI18n } from "@finance/i18n";
import { initReactI18next } from "react-i18next";

/** The global react-i18next instance the components under test translate with (Spanish). */
const i18n = createI18n({ lng: "es", plugins: [initReactI18next] });

export default i18n;
