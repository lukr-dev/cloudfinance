import { defineStore } from "pinia";
import { ref } from "vue";
import type { Account, Transaction, TransactionList } from "../../shared/schemas";
import { api } from "../api/http";

/** Cross-view UI state: global dialogs and small counters. */
export const useUiStore = defineStore("ui", () => {
  const accountDialog = ref<{ open: boolean; account: Account | null }>({
    open: false,
    account: null,
  });
  const transactionDialog = ref<{
    open: boolean;
    transaction: Transaction | null;
    defaults: { account_id?: string; category_id?: string };
  }>({ open: false, transaction: null, defaults: {} });
  const uncategorizedCount = ref(0);
  /** Bumped after any write so views can refetch. */
  const revision = ref(0);

  function openAccount(account: Account | null = null) {
    accountDialog.value = { open: true, account };
  }

  function openTransaction(
    transaction: Transaction | null = null,
    defaults: { account_id?: string; category_id?: string } = {},
  ) {
    transactionDialog.value = { open: true, transaction, defaults };
  }

  async function refreshCounts() {
    const list = await api<TransactionList>("GET", "/transactions", { query: { limit: 1 } });
    uncategorizedCount.value = list.uncategorized_count;
  }

  function changed() {
    revision.value++;
    void refreshCounts();
  }

  return {
    accountDialog,
    transactionDialog,
    uncategorizedCount,
    revision,
    openAccount,
    openTransaction,
    refreshCounts,
    changed,
  };
});
