import { defineStore } from "pinia";
import { ref } from "vue";
import type { BudgetMonth, CategoryMonth, MoveInput } from "../../shared/schemas";
import { api } from "../api/http";

export const useBudgetStore = defineStore("budget", () => {
  const month = ref<BudgetMonth | null>(null);
  const loading = ref(false);
  const selectedId = ref<string | null>(null);
  const detail = ref<CategoryMonth | null>(null);
  let request = 0;

  async function load(m: string, currency: string) {
    const id = ++request;
    loading.value = true;
    try {
      const data = await api<BudgetMonth>("GET", `/budget/${m}`, { query: { currency } });
      if (id === request) month.value = data;
    } finally {
      if (id === request) loading.value = false;
    }
    if (selectedId.value) await loadDetail();
  }

  async function loadDetail() {
    const m = month.value;
    if (!m || !selectedId.value) {
      detail.value = null;
      return;
    }
    detail.value = await api<CategoryMonth>(
      "GET",
      `/budget/${m.month}/categories/${selectedId.value}`,
      {
        query: { currency: m.currency },
      },
    );
  }

  async function select(categoryId: string | null) {
    selectedId.value = categoryId;
    detail.value = null;
    await loadDetail();
  }

  async function assign(categoryId: string, amountMinor: number) {
    const m = month.value;
    if (!m) return;
    await api("PUT", `/budget/${m.month}/assignments/${categoryId}`, {
      body: { currency: m.currency, amount_minor: amountMinor },
    });
    await load(m.month, m.currency);
  }

  async function move(input: Omit<MoveInput, "currency">) {
    const m = month.value;
    if (!m) return;
    await api("POST", `/budget/${m.month}/move`, { body: { ...input, currency: m.currency } });
    await load(m.month, m.currency);
  }

  return { month, loading, selectedId, detail, load, select, assign, move };
});
