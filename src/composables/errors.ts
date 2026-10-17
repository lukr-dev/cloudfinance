import { useI18n } from "vue-i18n";
import { ApiError } from "../api/http";
import { useToasts } from "./toasts";

/** Translate API error codes; fall back to the server message. */
export function useErrorToast() {
  const i18n = useI18n();
  const { push } = useToasts();
  return (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.code === "NETWORK") return push(i18n.t("errors.network"), "error");
      const key = `errors.${error.code}`;
      return push(i18n.te(key) ? i18n.t(key) : error.message || i18n.t("errors.generic"), "error");
    }
    console.error(error);
    push(i18n.t("errors.generic"), "error");
  };
}
