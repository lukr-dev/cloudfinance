<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { useUiStore } from "../../stores/ui";
import AppIcon, { type IconName } from "../ui/AppIcon.vue";

/** Primary navigation on phones and small tablets; replaces the sidebar there. */
const { t } = useI18n();
const ui = useUiStore();

const items: { to: string; icon: IconName; label: string }[] = [
  { to: "/budget", icon: "budget", label: "nav.budget" },
  { to: "/transactions", icon: "transactions", label: "nav.transactions" },
  { to: "/accounts", icon: "accounts", label: "nav.accounts" },
  { to: "/agents", icon: "agents", label: "nav.agentsShort" },
  { to: "/settings", icon: "settings", label: "nav.settings" },
];
</script>

<template>
  <nav class="tabbar" :aria-label="t('nav.main')">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="tab"
      active-class="is-active"
    >
      <span class="tab__icon">
        <AppIcon :name="item.icon" :size="22" />
        <span
          v-if="item.to === '/transactions' && ui.reviewCount"
          class="tab__badge num"
          :aria-label="t('budget.uncategorized', { n: ui.reviewCount }, ui.reviewCount)"
          >{{ ui.reviewCount }}</span
        >
      </span>
      <span class="tab__label">{{ t(item.label) }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabbar {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  height: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
  padding: 0 var(--space-1) env(safe-area-inset-bottom);
  background: var(--surface-sunken);
  border-top: 1px solid var(--border);
}
.tab {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 2px;
  min-width: 0;
  color: var(--text-faint);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.tab.is-active {
  color: var(--text);
}
.tab.is-active .tab__icon {
  color: var(--accent);
}
.tab__icon {
  position: relative;
  display: grid;
}
.tab__badge {
  position: absolute;
  top: -4px;
  left: 14px;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--caution);
  color: var(--text-inverse);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 17px;
  text-align: center;
}
.tab__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
}
</style>
