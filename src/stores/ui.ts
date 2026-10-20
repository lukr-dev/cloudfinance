import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  Account,
  IncomingShareList,
  Transaction,
  TransactionList,
} from "../../shared/schemas";
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
  /** Active shares from other people that still need a category. */
  const sharedUncategorizedCount = ref(0);
  /** Whether anyone has ever shared an entry with this user (shows the "Shared with me" tab). */
  const hasIncomingShares = ref(false);
  /** Everything waiting for a category: own transactions plus shares from others. */
  const reviewCount = computed(() => uncategorizedCount.value + sharedUncategorizedCount.value);
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
    const [list, open, any] = await Promise.all([
      api<TransactionList>("GET", "/transactions", { query: { limit: 1 } }),
      api<IncomingShareList>("GET", "/shares", {
        query: { status: "active", uncategorized: "true", limit: 200 },
      }).catch(() => null),
      hasIncomingShares.value
        ? null
        : api<IncomingShareList>("GET", "/shares", { query: { limit: 1 } }).catch(() => null),
    ]);
    uncategorizedCount.value = list.uncategorized_count;
    sharedUncategorizedCount.value = open?.shares.length ?? 0;
    if (any?.shares.length || open?.shares.length) hasIncomingShares.value = true;
  }

  function changed() {
    revision.value++;
    void refreshCounts();
  }

  return {
    accountDialog,
    transactionDialog,
    uncategorizedCount,
    sharedUncategorizedCount,
    hasIncomingShares,
    reviewCount,
    revision,
    openAccount,
    openTransaction,
    refreshCounts,
    changed,
  };
});
