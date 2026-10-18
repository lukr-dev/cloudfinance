<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";
import { useMoney } from "../../composables/money";
import { useAccountsStore } from "../../stores/accounts";
import { useSessionStore } from "../../stores/session";
import { useSettingsStore } from "../../stores/settings";
import { useUiStore } from "../../stores/ui";
import AppIcon from "../ui/AppIcon.vue";
import IconButton from "../ui/IconButton.vue";
import BrandMark from "./BrandMark.vue";

const { t } = useI18n();
const { format } = useMoney();
const accounts = useAccountsStore();
const settings = useSettingsStore();
const session = useSessionStore();
const ui = useUiStore();
const router = useRouter();

/** Show the currency code only when it differs from the base currency. */
function balance(amount: number, currency: string) {
  return format(amount, currency, { code: currency !== settings.settings?.base_currency });
}

async function signOut() {
  await session.signOut();
  await router.replace("/login");
}
</script>

<template>
  <aside class="sidebar">
    <RouterLink to="/budget" class="sidebar__brand"><BrandMark /></RouterLink>

    <nav class="sidebar__nav">
      <RouterLink to="/budget" class="nav-item" active-class="is-active">
        <AppIcon name="budget" />{{ t("nav.budget") }}
      </RouterLink>
      <RouterLink to="/transactions" class="nav-item" active-class="is-active">
        <AppIcon name="transactions" />{{ t("nav.transactions") }}
        <span v-if="ui.uncategorizedCount" class="badge num">{{ ui.uncategorizedCount }}</span>
      </RouterLink>
      <RouterLink to="/accounts" class="nav-item" active-class="is-active">
        <AppIcon name="accounts" />{{ t("nav.accounts") }}
      </RouterLink>
    </nav>

    <section
      v-for="section in [
        { key: 'budget', title: t('nav.onBudget'), items: accounts.onBudget, totals: true },
        { key: 'tracking', title: t('nav.tracking'), items: accounts.tracking, totals: false },
      ].filter((s) => s.items.length)"
      :key="section.key"
      class="side-section"
    >
      <div class="side-heading">
        <span>{{ section.title }}</span>
        <span v-if="section.totals" class="side-heading__totals">
          <span v-for="total in accounts.budgetTotals" :key="total.currency" class="num">
            {{ format(total.amount, total.currency, { code: true }) }}
          </span>
        </span>
      </div>
      <RouterLink
        v-for="account in section.items"
        :key="account.id"
        :to="{ path: '/transactions', query: { account: account.id } }"
        class="account"
        :class="{ 'is-active': $route.query.account === account.id }"
      >
        <span class="account__name">{{ account.name }}</span>
        <span class="num account__balance" :class="{ neg: account.balance_minor < 0 }">
          {{ balance(account.balance_minor, account.currency) }}
        </span>
      </RouterLink>
    </section>

    <button type="button" class="add-link" @click="ui.openAccount()">
      <AppIcon name="plus" :size="14" :stroke-width="2" />{{ t("nav.addAccount") }}
    </button>

    <div class="sidebar__foot">
      <RouterLink to="/agents" class="nav-item" active-class="is-active">
        <AppIcon name="agents" />{{ t("nav.agents") }}
      </RouterLink>
      <RouterLink to="/settings" class="nav-item" active-class="is-active">
        <AppIcon name="settings" />{{ t("nav.settings") }}
      </RouterLink>
      <div class="user">
        <span class="user__avatar">{{
          (session.user?.name || session.user?.email || "?")[0]?.toUpperCase()
        }}</span>
        <span class="user__email">{{ session.user?.email }}</span>
        <IconButton icon="logout" :label="t('nav.signOut')" :size="15" @click="signOut" />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  background: var(--surface-sunken);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-3);
  overflow-y: auto;
  height: 100%;
}
.sidebar__brand {
  padding: var(--space-2) var(--space-3) var(--space-5);
  text-decoration: none;
}
.sidebar__nav {
  display: grid;
  gap: var(--space-1);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 38px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 500;
  border: 1px solid transparent;
}
.nav-item:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.nav-item.is-active {
  background: var(--surface-raised);
  color: var(--text);
  border-color: var(--border);
  box-shadow: var(--shadow-card);
}
.nav-item.is-active :deep(svg) {
  color: var(--accent);
}
.badge {
  margin-left: auto;
  font-size: var(--text-xs);
  font-weight: 600;
  background: var(--caution-soft);
  color: var(--caution);
  padding: 1px 7px;
  border-radius: var(--radius-pill);
}
.side-section {
  margin-top: var(--space-6);
}
.side-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  padding: 0 var(--space-3) var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-faint);
  font-weight: 500;
}
.side-heading__totals {
  display: grid;
  justify-items: end;
  font-size: var(--text-xs);
}
.account {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  padding: 7px var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text);
  text-decoration: none;
  font-size: 0.875rem;
}
.account:hover {
  background: var(--surface-hover);
}
.account.is-active {
  background: var(--surface-active);
}
.account__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account__balance {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.account__balance.neg {
  color: var(--negative);
}
.add-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: 7px var(--space-3);
  color: var(--text-faint);
  font-size: var(--text-sm);
  border: 0;
  background: none;
  cursor: pointer;
  border-radius: var(--radius-md);
  text-align: left;
}
.add-link:hover {
  color: var(--accent);
  background: var(--surface-hover);
}
.sidebar__foot {
  margin-top: auto;
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-1);
}
.user {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.user__avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  font-weight: 600;
  font-size: var(--text-xs);
  flex: none;
}
.user__email {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
