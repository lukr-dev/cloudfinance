import { createI18n } from "vue-i18n";

export const i18n = createI18n({
  legacy: false,
  locale: navigator.language.startsWith("de") ? "de" : "en",
  fallbackLocale: "en",
  messages: {
    de: {
      home: "cloudfinance – Grundlage",
      login: "Anmelden",
      setup: "Einmalig ein Konto erstellen",
    },
    en: { home: "cloudfinance foundation", login: "Sign in", setup: "Create your account once" },
  },
});
