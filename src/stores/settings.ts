import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Settings, SettingsUpdate } from "../../shared/schemas";
import { api } from "../api/http";
import { useTheme } from "../composables/theme";
import { setLocale } from "../i18n";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings | null>(null);
  const { preference } = useTheme();

  function apply(next: Settings) {
    settings.value = next;
    setLocale(next.locale);
    preference.value = next.theme;
  }

  async function load() {
    apply(await api<Settings>("GET", "/settings"));
  }

  async function update(patch: SettingsUpdate) {
    apply(await api<Settings>("PATCH", "/settings", { body: patch }));
  }

  /** Enabled currencies with the base currency first. */
  const currencies = computed(() => {
    const s = settings.value;
    if (!s) return [];
    return [s.base_currency, ...s.enabled_currencies.filter((c) => c !== s.base_currency)];
  });

  return { settings, currencies, load, update };
});
