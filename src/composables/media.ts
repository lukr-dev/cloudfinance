import { onScopeDispose, ref } from "vue";

/** Reactive `matchMedia`. Keep queries in sync with the CSS breakpoints that use them. */
export function useMediaQuery(query: string) {
  const list = window.matchMedia(query);
  const matches = ref(list.matches);
  const update = (event: MediaQueryListEvent) => (matches.value = event.matches);
  list.addEventListener("change", update);
  onScopeDispose(() => list.removeEventListener("change", update));
  return matches;
}

/** Phone layout: bottom tab bar, list rows instead of tables. */
export const PHONE = "(max-width: 760px)";
