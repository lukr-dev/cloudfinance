<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import type { Transaction, TransactionList } from "../../shared/schemas";
import { api } from "../api/http";
import BudgetHero from "../components/budget/BudgetHero.vue";
import BudgetTable from "../components/budget/BudgetTable.vue";
import CategoryDialog from "../components/budget/CategoryDialog.vue";
import CategoryInspector from "../components/budget/CategoryInspector.vue";
import GroupDialog from "../components/budget/GroupDialog.vue";
import MoveMoneyDialog from "../components/budget/MoveMoneyDialog.vue";
import PageLayout from "../components/layout/PageLayout.vue";
import RecentTransactions from "../components/transactions/RecentTransactions.vue";
import AgentActivity from "../components/budget/AgentActivity.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import IconButton from "../components/ui/IconButton.vue";
import SegmentedControl from "../components/ui/SegmentedControl.vue";
import UiButton from "../components/ui/UiButton.vue";
import { useErrorToast } from "../composables/errors";
import { currentMonth, monthLabel, shiftMonth } from "../composables/month";
import { useBudgetStore } from "../stores/budget";
import { useCatalogStore } from "../stores/catalog";
import { useSettingsStore } from "../stores/settings";
import { useUiStore } from "../stores/ui";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const budget = useBudgetStore();
const catalog = useCatalogStore();
const settings = useSettingsStore();
const ui = useUiStore();
const showError = useErrorToast();

const month = computed(() => (route.params.month as string | undefined) || currentMonth());
const currency = computed(
  () => (route.query.currency as string | undefined) ?? settings.settings?.base_currency ?? "CHF",
);
const recent = ref<Transaction[]>([]);
const hasCategories = computed(() => catalog.categories.some((c) => c.kind === "expense"));

async function load() {
  try {
    const [, list] = await Promise.all([
      budget.load(month.value, currency.value),
      api<TransactionList>("GET", "/transactions", { query: { limit: 30 } }),
    ]);
    recent.value = list.transactions.filter((tx) => tx.currency === currency.value).slice(0, 6);
  } catch (e) {
    showError(e);
  }
}
watch([month, currency, () => ui.revision], load, { immediate: true });

function go(nextMonth: string, nextCurrency = currency.value) {
  void router.replace({
    path: nextMonth === currentMonth() ? "/budget" : `/budget/${nextMonth}`,
    query: nextCurrency === settings.settings?.base_currency ? {} : { currency: nextCurrency },
  });
}

const currencyModel = computed({
  get: () => currency.value,
  set: (value: string) => go(month.value, value),
});

async function assign(categoryId: string, amountMinor: number) {
  try {
    await budget.assign(categoryId, amountMinor);
  } catch (e) {
    showError(e);
  }
}

async function saveNote(note: string) {
  if (!budget.selectedId) return;
  try {
    await catalog.updateCategory(budget.selectedId, { note });
    await budget.select(budget.selectedId);
  } catch (e) {
    showError(e);
  }
}

async function addStarter() {
  try {
    await catalog.addStarterSet();
    ui.changed();
  } catch (e) {
    showError(e);
  }
}

// dialogs
const moveOpen = ref(false);
const categoryDialog = ref({
  open: false,
  categoryId: null as string | null,
  groupId: null as string | null,
});
const groupDialog = ref({ open: false, groupId: null as string | null });
</script>

<template>
  <PageLayout :title="t('budget.title')" :inspector-open="!!budget.selectedId">
    <template #actions>
      <div class="month-nav">
        <IconButton
          icon="chevron-left"
          :label="t('budget.previousMonth')"
          @click="go(shiftMonth(month, -1))"
        />
        <button
          type="button"
          class="month-label"
          :title="t('budget.thisMonth')"
          @click="go(currentMonth())"
        >
          {{ monthLabel(month, locale) }}
        </button>
        <IconButton
          icon="chevron-right"
          :label="t('budget.nextMonth')"
          @click="go(shiftMonth(month, 1))"
        />
      </div>
      <SegmentedControl
        v-if="settings.currencies.length > 1 && settings.currencies.length <= 4"
        v-model="currencyModel"
        :label="t('budget.currency')"
        :options="settings.currencies.map((c) => ({ value: c, label: c }))"
      />
      <select
        v-else-if="settings.currencies.length > 4"
        v-model="currencyModel"
        class="input currency-select"
        :aria-label="t('budget.currency')"
      >
        <option v-for="c in settings.currencies" :key="c" :value="c">{{ c }}</option>
      </select>
      <span class="divider" />
      <UiButton variant="primary" icon="plus" @click="ui.openTransaction()">{{
        t("transactions.add")
      }}</UiButton>
    </template>

    <template v-if="budget.month">
      <BudgetHero :data="budget.month" />
      <hr class="section-rule" />

      <template v-if="hasCategories">
        <div class="section-head">
          <h2 class="section-title">{{ t("budget.categories") }}</h2>
          <div class="section-links">
            <button type="button" class="link" @click="moveOpen = true">
              {{ t("move.title") }}
            </button>
            <button type="button" class="link" @click="groupDialog = { open: true, groupId: null }">
              + {{ t("budget.addGroup") }}
            </button>
          </div>
        </div>
        <BudgetTable
          :data="budget.month"
          :selected-id="budget.selectedId"
          @select="(id) => budget.select(id === budget.selectedId ? null : id)"
          @assign="assign"
          @add-category="(groupId) => (categoryDialog = { open: true, categoryId: null, groupId })"
          @edit-group="(groupId) => (groupDialog = { open: true, groupId })"
        />
      </template>
      <EmptyState
        v-else
        icon="budget"
        :title="t('budget.emptyTitle')"
        :body="t('budget.emptyBody')"
      >
        <UiButton variant="primary" @click="addStarter">{{ t("budget.starterSet") }}</UiButton>
        <UiButton @click="groupDialog = { open: true, groupId: null }"
          >+ {{ t("budget.addGroup") }}</UiButton
        >
      </EmptyState>

      <template v-if="recent.length">
        <hr class="section-rule" />
        <div class="section-head">
          <h2 class="section-title">{{ t("budget.recent") }}</h2>
          <RouterLink to="/transactions" class="link">{{ t("budget.viewAll") }}</RouterLink>
        </div>
        <RecentTransactions :transactions="recent" />
      </template>
    </template>

    <template #status>
      <span v-if="budget.month">
        {{
          t(
            "budget.uncategorized",
            { n: budget.month.uncategorized_count },
            budget.month.uncategorized_count,
          )
        }}
      </span>
      <AgentActivity />
    </template>

    <template #inspector>
      <CategoryInspector
        v-if="budget.month"
        :month="budget.month"
        :detail="budget.detail"
        :selected-id="budget.selectedId"
        @close="budget.select(null)"
        @assign="(value) => budget.selectedId && assign(budget.selectedId, value)"
        @move="moveOpen = true"
        @edit="categoryDialog = { open: true, categoryId: budget.selectedId, groupId: null }"
        @save-note="saveNote"
        @review-uncategorized="
          router.push({ path: '/transactions', query: { uncategorized: '1' } })
        "
      />
    </template>
  </PageLayout>

  <template v-if="budget.month">
    <MoveMoneyDialog v-model:open="moveOpen" :month="budget.month" :from-id="budget.selectedId" />
  </template>
  <CategoryDialog
    v-model:open="categoryDialog.open"
    :category-id="categoryDialog.categoryId"
    :group-id="categoryDialog.groupId"
  />
  <GroupDialog v-model:open="groupDialog.open" :group-id="groupDialog.groupId" />
</template>

<style scoped>
.month-nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.month-label {
  min-width: 136px;
  height: 32px;
  padding: 0 var(--space-2);
  border: 0;
  background: none;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
}
.month-label:hover {
  background: var(--surface-hover);
}
.currency-select {
  width: auto;
  height: 32px;
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.divider {
  width: 1px;
  height: 24px;
  background: var(--border);
}
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}
.section-title {
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: -0.005em;
}
.section-links {
  display: flex;
  gap: var(--space-6);
}
@media (max-width: 760px) {
  .divider,
  .month-label {
    min-width: 0;
  }
  .divider {
    display: none;
  }
}
</style>
