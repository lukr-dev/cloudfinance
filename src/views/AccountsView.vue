<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import type { Account } from "../../shared/schemas";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import IconButton from "../components/ui/IconButton.vue";
import UiButton from "../components/ui/UiButton.vue";
import { institutionName } from "../composables/institutions";
import { useMoney } from "../composables/money";
import { useAccountsStore } from "../stores/accounts";
import { useUiStore } from "../stores/ui";

const { t } = useI18n();
const { format } = useMoney();
const accounts = useAccountsStore();
const ui = useUiStore();
const router = useRouter();
const showClosed = ref(false);

const sections = computed(() =>
  [
    { key: "budget", title: t("accounts.budgetAccounts"), items: accounts.onBudget },
    { key: "tracking", title: t("accounts.trackingAccounts"), items: accounts.tracking },
    {
      key: "closed",
      title: t("accounts.closed"),
      items: showClosed.value ? accounts.accounts.filter((a) => a.closed_at) : [],
    },
  ].filter((s) => s.items.length),
);

/** Totals per currency for a section. */
function totals(items: Account[]) {
  const map = new Map<string, number>();
  for (const a of items) map.set(a.currency, (map.get(a.currency) ?? 0) + a.balance_minor);
  return [...map.entries()];
}

function open(account: Account) {
  void router.push({ path: "/transactions", query: { account: account.id } });
}
</script>

<template>
  <PageLayout :title="t('accounts.title')">
    <template #actions>
      <UiButton variant="primary" icon="plus" @click="ui.openAccount()">{{
        t("accounts.add")
      }}</UiButton>
    </template>

    <EmptyState
      v-if="!accounts.accounts.length"
      icon="accounts"
      :title="t('accounts.emptyTitle')"
      :body="t('accounts.emptyBody')"
    >
      <UiButton variant="primary" icon="plus" @click="ui.openAccount()">{{
        t("accounts.add")
      }}</UiButton>
    </EmptyState>

    <section v-for="section in sections" :key="section.key" class="section">
      <div class="section-head">
        <h2>{{ section.title }}</h2>
        <span class="totals">
          <span v-for="[currency, amount] in totals(section.items)" :key="currency" class="num">
            {{ format(amount, currency, { code: true }) }}
          </span>
        </span>
      </div>
      <table class="data-table accounts">
        <thead>
          <tr>
            <th class="left">{{ t("accounts.name") }}</th>
            <th class="left hide-sm">{{ t("accounts.type") }}</th>
            <th class="hide-sm">{{ t("accounts.cleared") }}</th>
            <th class="hide-sm">{{ t("accounts.uncleared") }}</th>
            <th>{{ t("accounts.balance") }}</th>
            <th class="col-actions">
              <span class="sr-only">{{ t("common.actions") }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="a in section.items"
            :key="a.id"
            :class="{ closed: a.closed_at }"
            @click="open(a)"
          >
            <td class="left">
              <span class="name">{{ a.name }}</span>
              <span class="meta">{{
                [institutionName(a.institution), a.currency].filter(Boolean).join(" · ")
              }}</span>
            </td>
            <td class="left muted hide-sm">{{ t(`accounts.types.${a.type}`) }}</td>
            <td class="num muted hide-sm">{{ format(a.cleared_balance_minor, a.currency) }}</td>
            <td class="num muted hide-sm">{{ format(a.uncleared_balance_minor, a.currency) }}</td>
            <td class="num balance" :class="{ neg: a.balance_minor < 0 }">
              {{ format(a.balance_minor, a.currency) }}
            </td>
            <td class="col-actions">
              <IconButton icon="edit" :label="t('common.edit')" @click.stop="ui.openAccount(a)" />
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <label v-if="accounts.accounts.some((a) => a.closed_at)" class="checkbox">
      <input v-model="showClosed" type="checkbox" />{{ t("accounts.showClosed") }}
    </label>
  </PageLayout>
</template>

<style scoped>
.section {
  margin-bottom: var(--space-10);
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-3);
}
.section-head h2 {
  font-size: var(--text-lg);
  font-weight: 600;
}
.totals {
  display: flex;
  gap: var(--space-4);
  color: var(--text-muted);
  font-weight: 500;
}
.accounts td {
  height: 58px;
}
.accounts tbody tr {
  cursor: pointer;
}
.accounts tbody tr:hover td {
  background: var(--surface-hover);
}
.name {
  display: block;
  font-weight: 500;
}
.meta {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-faint);
}
.balance {
  font-weight: 600;
}
.neg {
  color: var(--negative);
}
.closed {
  opacity: 0.6;
}
.col-actions {
  width: 48px;
}
@media (max-width: 760px) {
  .hide-sm {
    display: none;
  }
}
</style>
