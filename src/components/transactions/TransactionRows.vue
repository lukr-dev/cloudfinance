<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Transaction } from "../../../shared/schemas";
import { useMoney } from "../../composables/money";
import { dayHeading } from "../../composables/month";
import { useUiStore } from "../../stores/ui";
import AppIcon from "../ui/AppIcon.vue";
import CategoryCell from "./CategoryCell.vue";

/** Phone layout for transactions: grouped by day, two lines per row. */
const props = defineProps<{ transactions: Transaction[]; hideAccount?: boolean }>();
const { t, locale } = useI18n();
const { format } = useMoney();
const ui = useUiStore();

const days = computed(() => {
  const groups: { date: string; items: Transaction[] }[] = [];
  for (const tx of props.transactions) {
    const last = groups.at(-1);
    if (last?.date === tx.date) last.items.push(tx);
    else groups.push({ date: tx.date, items: [tx] });
  }
  return groups;
});
</script>

<template>
  <div class="rows">
    <section v-for="day in days" :key="day.date" class="day">
      <h3 class="day__head">
        {{
          dayHeading(day.date, locale, {
            today: t("common.todayTitle"),
            yesterday: t("common.yesterday"),
          })
        }}
      </h3>
      <button
        v-for="tx in day.items"
        :key="tx.id"
        type="button"
        class="row"
        @click="ui.openTransaction(tx)"
      >
        <span class="row__main">
          <span class="row__payee">{{ tx.payee || "—" }}</span>
          <span class="row__meta"><CategoryCell :transaction="tx" /></span>
        </span>
        <span class="row__side">
          <span class="row__amount num" :class="{ inflow: tx.amount_minor > 0 }">
            {{ format(tx.amount_minor, tx.currency, { signed: true }) }}
          </span>
          <span class="row__account">
            <span v-if="tx.share" class="row__own">
              <AppIcon name="users" :size="11" :stroke-width="2" />{{
                format(tx.own_amount_minor, tx.currency, { signed: true })
              }}
            </span>
            <span v-else-if="!hideAccount">{{ tx.account_name }}</span>
            <span
              class="row__cleared"
              :class="`row__cleared--${tx.cleared}`"
              :title="t(`transactions.status.${tx.cleared}`)"
            />
          </span>
        </span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.day + .day {
  margin-top: var(--space-4);
}
.day__head {
  padding: var(--space-2) 0;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-faint);
  border-bottom: 1px solid var(--border);
}
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 60px;
  padding: var(--space-2) 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: none;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.row:active {
  background: var(--surface-hover);
}
.row__main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}
.row__payee {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__meta {
  display: flex;
  min-width: 0;
  font-size: var(--text-sm);
}
.row__meta > :deep(*) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__side {
  flex: none;
  max-width: 45%;
  display: grid;
  justify-items: end;
  gap: 2px;
}
.row__amount {
  font-weight: 500;
}
.row__account {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  font-size: var(--text-xs);
  color: var(--text-faint);
}
.row__account > span:first-child:not(.row__cleared) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__own {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-muted);
}
.row__cleared {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
}
.row__cleared--cleared,
.row__cleared--reconciled {
  border-color: transparent;
  background: var(--positive);
}
.inflow {
  color: var(--positive);
}
</style>
