<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { Transaction } from "../../../shared/schemas";
import { PHONE, useMediaQuery } from "../../composables/media";
import { useMoney } from "../../composables/money";
import { formatDate } from "../../composables/month";
import { useUiStore } from "../../stores/ui";
import CategoryCell from "./CategoryCell.vue";
import TransactionRows from "./TransactionRows.vue";

defineProps<{ transactions: Transaction[] }>();
const { t, locale } = useI18n();
const { format } = useMoney();
const ui = useUiStore();
const phone = useMediaQuery(PHONE);
</script>

<template>
  <TransactionRows v-if="phone" :transactions="transactions" />
  <table v-else class="data-table recent">
    <thead>
      <tr>
        <th class="left">{{ t("transactions.date") }}</th>
        <th class="left">{{ t("transactions.payee") }}</th>
        <th class="left">{{ t("transactions.category") }}</th>
        <th class="left hide-sm">{{ t("transactions.account") }}</th>
        <th>{{ t("transactions.amount") }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="tx in transactions" :key="tx.id" @click="ui.openTransaction(tx)">
        <td class="left muted date">{{ formatDate(tx.date, locale) }}</td>
        <td class="left payee">
          {{ tx.payee || "—" }}<span v-if="tx.memo" class="memo">{{ tx.memo }}</span>
        </td>
        <td class="left"><CategoryCell :transaction="tx" /></td>
        <td class="left muted hide-sm">{{ tx.account_name }}</td>
        <td class="num" :class="{ inflow: tx.amount_minor > 0 }">
          {{ format(tx.amount_minor, tx.currency, { signed: true }) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.recent td {
  height: 44px;
  font-size: 0.875rem;
}
.recent tbody tr {
  cursor: pointer;
}
.recent tbody tr:hover td {
  background: var(--surface-hover);
}
.date {
  width: 96px;
  white-space: nowrap;
}
.payee {
  font-weight: 500;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.memo {
  color: var(--text-faint);
  font-weight: 400;
  margin-left: var(--space-2);
}
.inflow {
  color: var(--positive);
}
@media (max-width: 760px) {
  .hide-sm {
    display: none;
  }
}
</style>
