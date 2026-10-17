import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Account, AccountCreate, AccountUpdate } from "../../shared/schemas";
import { api } from "../api/http";

export const useAccountsStore = defineStore("accounts", () => {
  const accounts = ref<Account[]>([]);
  const loaded = ref(false);

  async function load() {
    accounts.value = await api<Account[]>("GET", "/accounts", { query: { include_closed: true } });
    loaded.value = true;
  }

  async function create(input: AccountCreate) {
    const account = await api<Account>("POST", "/accounts", { body: input });
    await load();
    return account;
  }

  async function update(id: string, patch: AccountUpdate) {
    await api<Account>("PATCH", `/accounts/${id}`, { body: patch });
    await load();
  }

  async function remove(id: string) {
    await api("DELETE", `/accounts/${id}`);
    await load();
  }

  const open = computed(() => accounts.value.filter((a) => !a.closed_at));
  const onBudget = computed(() => open.value.filter((a) => a.on_budget));
  const tracking = computed(() => open.value.filter((a) => !a.on_budget));
  const byId = computed(() => new Map(accounts.value.map((a) => [a.id, a])));

  /** On-budget balance per currency, for the sidebar heading. */
  const budgetTotals = computed(() => {
    const totals = new Map<string, number>();
    for (const a of onBudget.value)
      totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.balance_minor);
    return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
  });

  return {
    accounts,
    loaded,
    open,
    onBudget,
    tracking,
    byId,
    budgetTotals,
    load,
    create,
    update,
    remove,
  };
});
