import { ref, watchEffect } from "vue";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "cf.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function stored(): ThemePreference {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

const preference = ref<ThemePreference>(stored());
const systemDark = ref(media.matches);
media.addEventListener("change", (event) => (systemDark.value = event.matches));

watchEffect(() => {
  const resolved =
    preference.value === "system" ? (systemDark.value ? "dark" : "light") : preference.value;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem(STORAGE_KEY, preference.value);
});

/** Global theme preference; the server copy lives in settings and is applied on load. */
export function useTheme() {
  return { preference };
}
