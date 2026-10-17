import { readonly, ref } from "vue";

export interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

const toasts = ref<Toast[]>([]);
let nextId = 1;

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

function push(message: string, tone: Toast["tone"] = "success") {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, message, tone }];
  setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3000);
}

export function useToasts() {
  return { toasts: readonly(toasts), push, dismiss };
}
