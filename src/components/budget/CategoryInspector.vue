<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { BudgetMonth, CategoryMonth } from "../../../shared/schemas";
import { useMoney } from "../../composables/money";
import { formatDay, monthLabel } from "../../composables/month";
import AvailablePill from "../ui/AvailablePill.vue";
import CategoryDot from "../ui/CategoryDot.vue";
import IconButton from "../ui/IconButton.vue";

const props = defineProps<{
  month: BudgetMonth;
  detail: CategoryMonth | null;
  selectedId: string | null;
}>();
const emit = defineEmits<{
  close: [];
  assign: [amountMinor: number];
  move: [];
  edit: [];
  saveNote: [note: string];
  reviewUncategorized: [];
}>();

const { t, locale } = useI18n();
const { format } = useMoney();
const cur = computed(() => props.month.currency);

const note = ref("");
watch(
  () => props.detail?.note,
  (value) => (note.value = value ?? ""),
  { immediate: true },
);

const quick = computed(() => {
  const d = props.detail;
  if (!d) return [];
  const options = [
    { label: t("inspector.assignedLastMonth"), value: d.assigned_last_month_minor },
    { label: t("inspector.spentLastMonth"), value: d.spent_last_month_minor },
    { label: t("inspector.averageSpent"), value: Math.round(d.average_spent_3m_minor) },
  ].filter((o) => o.value > 0);
  if (d.available_minor < 0) {
    options.unshift({
      label: t("inspector.coverOverspending"),
      value: d.assigned_minor - d.available_minor,
    });
  }
  return options;
});

const net = computed(
  () => props.month.income_this_month_minor + props.month.activity_this_month_minor,
);
</script>

<template>
  <div class="inspector">
    <!-- category selected -->
    <template v-if="selectedId">
      <header class="inspector__head">
        <h2>
          <CategoryDot :color="detail?.color" />
          <span>{{ detail?.name ?? "…" }}</span>
        </h2>
        <span>
          <IconButton icon="edit" :label="t('inspector.edit')" @click="emit('edit')" />
          <IconButton icon="close" :label="t('common.close')" @click="emit('close')" />
        </span>
      </header>

      <div v-if="detail" class="inspector__body">
        <div>
          <p class="label">{{ t("inspector.available") }}</p>
          <div
            class="figure num"
            :class="{ neg: detail.available_minor < 0, zero: detail.available_minor === 0 }"
          >
            <span class="figure__code">{{ cur }}</span
            >{{ format(detail.available_minor, cur) }}
          </div>
        </div>

        <dl class="ledger">
          <div>
            <dt>{{ t("inspector.carriedOver") }}</dt>
            <dd class="num">{{ format(detail.carried_over_minor, cur) }}</dd>
          </div>
          <div>
            <dt>{{ t("inspector.assignedThisMonth") }}</dt>
            <dd class="num">{{ format(detail.assigned_minor, cur) }}</dd>
          </div>
          <div>
            <dt>{{ t("inspector.activity") }}</dt>
            <dd class="num">{{ format(detail.activity_minor, cur) }}</dd>
          </div>
        </dl>

        <section>
          <h3 class="label">{{ t("inspector.quickAssign") }}</h3>
          <div class="quick">
            <button
              v-for="option in quick"
              :key="option.label"
              type="button"
              class="quick__btn"
              @click="emit('assign', option.value)"
            >
              <span>{{ option.label }}</span>
              <span class="num">{{ format(option.value, cur) }}</span>
            </button>
            <button type="button" class="quick__btn" @click="emit('move')">
              <span>{{ t("inspector.moveMoney") }}</span>
            </button>
          </div>
        </section>

        <section>
          <h3 class="label">{{ t("inspector.note") }}</h3>
          <textarea
            v-model="note"
            class="input note"
            rows="2"
            :placeholder="t('inspector.addNote')"
            @blur="note !== (detail.note ?? '') && emit('saveNote', note)"
          />
        </section>

        <section>
          <h3 class="label">{{ t("inspector.thisMonth") }}</h3>
          <p v-if="!detail.transactions.length" class="faint small">
            {{ t("inspector.noActivity") }}
          </p>
          <ul v-else class="mini-tx">
            <li v-for="tx in detail.transactions" :key="tx.id">
              <span>
                {{ tx.payee || "—" }}
                <small>{{ formatDay(tx.date, locale) }} · {{ tx.account_name }}</small>
              </span>
              <span class="num">{{ format(tx.amount_minor, tx.currency) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <!-- nothing selected: month at a glance -->
    <template v-else>
      <header class="inspector__head">
        <h2>{{ monthLabel(month.month, locale, "long") }}</h2>
      </header>
      <div class="inspector__body">
        <dl class="ledger ledger--glance">
          <div>
            <dt>{{ t("inspector.income") }}</dt>
            <dd class="num">{{ format(month.income_this_month_minor, cur) }}</dd>
          </div>
          <div>
            <dt>{{ t("inspector.spent") }}</dt>
            <dd class="num">{{ format(-month.activity_this_month_minor, cur) }}</dd>
          </div>
          <div class="ledger__total">
            <dt>{{ t("budget.net") }}</dt>
            <dd class="num" :class="net >= 0 ? 'pos' : 'neg'">
              {{ format(net, cur, { signed: true }) }}
            </dd>
          </div>
        </dl>
        <div class="glance-available">
          <span>{{ t("inspector.available") }}</span>
          <AvailablePill :amount-minor="month.available_total_minor" :currency="cur" />
        </div>
        <button
          v-if="month.uncategorized_count"
          type="button"
          class="review"
          @click="emit('reviewUncategorized')"
        >
          <span>{{
            t("budget.uncategorized", { n: month.uncategorized_count }, month.uncategorized_count)
          }}</span>
          <span class="link">{{ t("budget.review") }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.inspector__head {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0 var(--space-3) 0 var(--space-5);
  border-bottom: 1px solid var(--border);
}
.inspector__head h2 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-md);
  font-weight: 600;
}
.inspector__head h2 span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inspector__head > span {
  display: flex;
  flex: none;
}
.inspector__head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-sunken);
}
.inspector__body {
  padding: var(--space-5);
  display: grid;
  gap: var(--space-6);
}
.figure {
  margin-top: var(--space-2);
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 2.25rem;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--positive);
}
.figure.neg {
  color: var(--negative);
}
.figure.zero {
  color: var(--text-muted);
}
.figure__code {
  font-size: 0.5em;
  color: var(--text-muted);
  margin-right: 0.2em;
}
.ledger {
  margin: 0;
}
.ledger > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  font-size: 0.875rem;
  border-bottom: 1px dashed var(--border);
}
.ledger dt {
  color: var(--text-muted);
}
.ledger dd {
  margin: 0;
}
.ledger > div:last-child {
  border-bottom: 0;
}
.ledger .ledger__total {
  border-bottom: 0;
  font-weight: 600;
}
.ledger .ledger__total dt {
  color: var(--text);
}
.ledger dd.pos {
  color: var(--positive);
}
.ledger dd.neg {
  color: var(--negative);
}
h3.label {
  margin-bottom: var(--space-2);
}
.quick {
  display: grid;
  gap: var(--space-2);
}
.quick__btn {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  padding: 10px var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-raised);
  cursor: pointer;
  font-size: 0.875rem;
  text-align: left;
}
@media (max-width: 900px) {
  .inspector__head {
    height: 56px;
  }
  /* Two columns of quick actions keep the sheet short. */
  .quick {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .quick__btn {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 56px;
  }
}
.quick__btn:hover {
  border-color: var(--accent);
}
.quick__btn .num {
  color: var(--text-muted);
}
.note {
  min-height: 64px;
  font-size: var(--text-sm);
}
.mini-tx {
  list-style: none;
  margin: 0;
  padding: 0;
}
.mini-tx li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 6px 0;
  font-size: var(--text-sm);
}
.mini-tx small {
  display: block;
  color: var(--text-faint);
  font-size: var(--text-xs);
}
.small {
  font-size: var(--text-sm);
}
.glance-available {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.review {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: var(--caution-soft);
  color: var(--caution);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.review .link {
  color: var(--caution);
}
</style>
