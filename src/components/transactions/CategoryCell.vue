<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Transaction } from "../../../shared/schemas";
import { useAccountsStore } from "../../stores/accounts";
import { useCatalogStore } from "../../stores/catalog";
import CategoryDot from "../ui/CategoryDot.vue";

const props = defineProps<{ transaction: Transaction }>();
const { t } = useI18n();
const accounts = useAccountsStore();
const catalog = useCatalogStore();

const view = computed(() => {
  const tx = props.transaction;
  const isIncome = tx.category_id !== null && tx.category_id === catalog.income?.id;
  if (tx.transfer_account_id && !tx.category_id) {
    const other = accounts.byId.get(tx.transfer_account_id)?.name ?? "";
    return { kind: "transfer" as const, label: `${tx.amount_minor < 0 ? "→" : "←"} ${other}` };
  }
  if (isIncome) return { kind: "income" as const, label: t("transactions.readyToAssign") };
  if (tx.category_id) return { kind: "category" as const, label: tx.category_name ?? "" };
  const account = accounts.byId.get(tx.account_id);
  if (account && !account.on_budget) return { kind: "none" as const, label: "" };
  return { kind: "uncategorized" as const, label: t("transactions.uncategorized") };
});
</script>

<template>
  <span v-if="view.kind === 'uncategorized'" class="tag">{{ view.label }}</span>
  <span v-else-if="view.kind === 'transfer'" class="cell muted">{{ view.label }}</span>
  <span v-else-if="view.kind !== 'none'" class="cell">
    <CategoryDot :color="view.kind === 'income' ? 'slate' : transaction.category_color" />{{
      view.label
    }}
  </span>
</template>

<style scoped>
.cell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
}
.tag {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--caution);
  background: var(--caution-soft);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
</style>
