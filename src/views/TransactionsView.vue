<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import type { Transaction, TransactionList } from "../../shared/schemas";
import { api } from "../api/http";
import PageLayout from "../components/layout/PageLayout.vue";
import CategoryCell from "../components/transactions/CategoryCell.vue";
import TransactionRows from "../components/transactions/TransactionRows.vue";
import AppIcon from "../components/ui/AppIcon.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import UiButton from "../components/ui/UiButton.vue";
import { useErrorToast } from "../composables/errors";
import { institutionName } from "../composables/institutions";
import { useMoney } from "../composables/money";
import { PHONE, useMediaQuery } from "../composables/media";
import { formatDate } from "../composables/month";
import { useAccountsStore } from "../stores/accounts";
import { useCatalogStore } from "../stores/catalog";
import { useUiStore } from "../stores/ui";

const PAGE = 100;
const { t, locale } = useI18n();
const { format } = useMoney();
const route = useRoute();
const router = useRouter();
const accounts = useAccountsStore();
const catalog = useCatalogStore();
const ui = useUiStore();
const showError = useErrorToast();
const phone = useMediaQuery(PHONE);

const rows = ref<Transaction[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const search = ref((route.query.q as string) ?? "");

const filters = computed(() => ({
  account: (route.query.account as string) || "",
  category: (route.query.category as string) || "",
  uncategorized: route.query.uncategorized === "1",
  q: (route.query.q as string) || "",
}));
const account = computed(() => accounts.byId.get(filters.value.account) ?? null);
const filtered = computed(() => Object.values(filters.value).some(Boolean));

function setFilter(
  patch: Partial<Record<"account" | "category" | "uncategorized" | "q", string | undefined>>,
) {
  const merged: Record<string, unknown> = { ...route.query, ...patch };
  const query = Object.fromEntries(Object.entries(merged).filter(([, value]) => value)) as Record<
    string,
    string
  >;
  void router.replace({ query });
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setFilter({ q: value.trim() || undefined }), 250);
});

async function load(more = false) {
  loading.value = true;
  try {
    const f = filters.value;
    const list = await api<TransactionList>("GET", "/transactions", {
      query: {
        account_id: f.account,
        category_id: f.category,
        uncategorized: f.uncategorized ? "true" : undefined,
        q: f.q,
        limit: PAGE,
        cursor: more ? cursor.value : undefined,
      },
    });
    rows.value = more ? [...rows.value, ...list.transactions] : list.transactions;
    cursor.value = list.next_cursor;
  } catch (e) {
    showError(e);
  } finally {
    loading.value = false;
  }
}
watch([filters, () => ui.revision], () => load(), { immediate: true, deep: true });

async function toggleCleared(tx: Transaction) {
  if (tx.cleared === "reconciled") return;
  const cleared = tx.cleared === "cleared" ? "uncleared" : "cleared";
  try {
    await api("PATCH", `/transactions/${tx.id}`, { body: { cleared } });
    tx.cleared = cleared;
    await accounts.load();
  } catch (e) {
    showError(e);
  }
}

function sourceLabel(source: string) {
  if (source.startsWith("import:")) return t("transactions.sources.import");
  return t(`transactions.sources.${source}`);
}
</script>

<template>
  <PageLayout :title="account ? account.name : t('transactions.title')" wide>
    <template #actions>
      <UiButton v-if="account" icon="edit" compact @click="ui.openAccount(account)">{{
        t("common.edit")
      }}</UiButton>
      <UiButton
        variant="primary"
        icon="plus"
        compact
        @click="ui.openTransaction(null, { account_id: account?.id })"
      >
        {{ t("transactions.add") }}
      </UiButton>
    </template>

    <div v-if="account" class="balances">
      <div class="balances__main">
        <span class="label">{{
          [t("accounts.balance"), institutionName(account.institution)].filter(Boolean).join(" · ")
        }}</span>
        <strong class="num" :class="{ neg: account.balance_minor < 0 }">{{
          format(account.balance_minor, account.currency, { code: true })
        }}</strong>
      </div>
      <div>
        <span class="label">{{ t("accounts.cleared") }}</span>
        <span class="num">{{ format(account.cleared_balance_minor, account.currency) }}</span>
      </div>
      <div>
        <span class="label">{{ t("accounts.uncleared") }}</span>
        <span class="num">{{ format(account.uncleared_balance_minor, account.currency) }}</span>
      </div>
    </div>

    <div class="filters">
      <label class="search">
        <AppIcon name="search" :size="16" />
        <input
          v-model="search"
          class="input"
          type="search"
          :placeholder="t('transactions.search')"
        />
      </label>
      <select
        class="input"
        :value="filters.account"
        :aria-label="t('transactions.account')"
        @change="setFilter({ account: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">{{ t("transactions.allAccounts") }}</option>
        <option v-for="a in accounts.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <select
        class="input"
        :value="filters.category"
        :aria-label="t('transactions.category')"
        @change="setFilter({ category: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">{{ t("transactions.allCategories") }}</option>
        <option v-if="catalog.income" :value="catalog.income.id">
          {{ t("transactions.readyToAssign") }}
        </option>
        <optgroup v-for="entry in catalog.grouped" :key="entry.group.id" :label="entry.group.name">
          <option v-for="c in entry.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </optgroup>
      </select>
      <label class="checkbox only-uncategorized">
        <input
          type="checkbox"
          :checked="filters.uncategorized"
          @change="
            setFilter({
              uncategorized: ($event.target as HTMLInputElement).checked ? '1' : undefined,
            })
          "
        />
        {{ t("transactions.onlyUncategorized") }}
        <span v-if="ui.uncategorizedCount" class="count num">{{ ui.uncategorizedCount }}</span>
      </label>
    </div>

    <TransactionRows v-if="rows.length && phone" :transactions="rows" :hide-account="!!account" />
    <table v-else-if="rows.length" class="data-table tx">
      <thead>
        <tr>
          <th class="left col-date">{{ t("transactions.date") }}</th>
          <th v-if="!account" class="left hide-md">{{ t("transactions.account") }}</th>
          <th class="left">{{ t("transactions.payee") }}</th>
          <th class="left">{{ t("transactions.category") }}</th>
          <th class="col-amount">{{ t("transactions.amount") }}</th>
          <th class="col-flags">
            <span class="sr-only">{{ t("transactions.cleared") }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="tx in rows"
          :key="tx.id"
          tabindex="0"
          @click="ui.openTransaction(tx)"
          @keydown.enter="ui.openTransaction(tx)"
        >
          <td class="left muted">{{ formatDate(tx.date, locale) }}</td>
          <td v-if="!account" class="left muted hide-md ellipsis">{{ tx.account_name }}</td>
          <td class="left payee ellipsis">
            {{ tx.payee || "—" }}<span v-if="tx.memo" class="memo">{{ tx.memo }}</span>
          </td>
          <td class="left"><CategoryCell :transaction="tx" /></td>
          <td class="num" :class="{ inflow: tx.amount_minor > 0 }">
            {{ format(tx.amount_minor, tx.currency, { signed: true }) }}
          </td>
          <td class="flags">
            <span v-if="tx.source !== 'manual'" class="source" :title="sourceLabel(tx.source)">
              <AppIcon
                :name="tx.source === 'mcp' || tx.source === 'api' ? 'agents' : 'inbox'"
                :size="13"
                :stroke-width="2"
              />
            </span>
            <button
              type="button"
              class="cleared"
              :class="`cleared--${tx.cleared}`"
              :title="t(`transactions.status.${tx.cleared}`)"
              :aria-label="t(`transactions.status.${tx.cleared}`)"
              @click.stop="toggleCleared(tx)"
            >
              C
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <EmptyState
      v-else-if="!loading"
      icon="transactions"
      :title="filtered ? t('transactions.emptyFiltered') : t('transactions.emptyTitle')"
      :body="filtered ? undefined : t('transactions.emptyBody')"
    >
      <UiButton v-if="!filtered" variant="primary" icon="plus" @click="ui.openTransaction()">{{
        t("transactions.add")
      }}</UiButton>
    </EmptyState>

    <div v-if="cursor" class="more">
      <UiButton :loading="loading" @click="load(true)">{{ t("transactions.loadMore") }}</UiButton>
    </div>

    <template #status>
      <span
        >{{ t("transactions.count", { n: rows.length }, rows.length) }}{{ cursor ? "+" : "" }}</span
      >
    </template>
  </PageLayout>
</template>

<style scoped>
.balances {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-10);
  margin-bottom: var(--space-8);
}
.balances > div {
  display: grid;
  gap: 2px;
}
.balances .label {
  font-weight: 400;
}
.balances strong {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 2rem;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.balances strong.neg {
  color: var(--negative);
}
.balances > div:not(:first-child) {
  align-self: end;
  padding-bottom: 4px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}
.filters select {
  width: auto;
  min-width: 180px;
}
.search {
  position: relative;
  flex: 1 1 260px;
  max-width: 360px;
  color: var(--text-faint);
}
.search :deep(svg) {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
}
.search .input {
  padding-left: 36px;
}
.count {
  font-size: var(--text-xs);
  font-weight: 600;
  background: var(--caution-soft);
  color: var(--caution);
  padding: 1px 7px;
  border-radius: var(--radius-pill);
}
.tx td {
  height: 46px;
  font-size: 0.875rem;
}
.tx tbody tr {
  cursor: pointer;
}
.tx tbody tr:hover td,
.tx tbody tr:focus-visible td {
  background: var(--surface-hover);
}
.tx tbody tr:focus-visible {
  outline: none;
}
.col-date {
  width: 120px;
}
.col-amount {
  width: 140px;
}
.col-flags {
  width: 64px;
}
.ellipsis {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.payee {
  font-weight: 500;
}
.memo {
  color: var(--text-faint);
  font-weight: 400;
  margin-left: var(--space-2);
}
.inflow {
  color: var(--positive);
}
.flags {
  white-space: nowrap;
}
.source {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  vertical-align: middle;
}
.cleared {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
  border: 1px solid var(--border-strong);
  background: none;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
}
.cleared:hover {
  border-color: var(--positive);
}
.cleared--cleared {
  background: var(--positive-soft);
  border-color: transparent;
  color: var(--positive);
}
.cleared--reconciled {
  background: var(--positive);
  border-color: transparent;
  color: var(--text-inverse);
}
.more {
  display: flex;
  justify-content: center;
  margin-top: var(--space-6);
}
@media (max-width: 1000px) {
  .hide-md {
    display: none;
  }
}
@media (max-width: 760px) {
  .balances {
    gap: var(--space-3) var(--space-6);
    margin-bottom: var(--space-6);
  }
  .balances__main {
    flex: 1 0 100%;
  }
  .balances strong {
    font-size: 1.75rem;
  }
  .balances > div:not(:first-child) {
    padding-bottom: 0;
    font-size: var(--text-sm);
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .search {
    grid-column: 1 / -1;
    max-width: none;
  }
  .filters select {
    min-width: 0;
    width: 100%;
  }
  .only-uncategorized {
    grid-column: 1 / -1;
    min-height: 36px;
  }
}
</style>
