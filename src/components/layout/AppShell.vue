<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useErrorToast } from "../../composables/errors";
import { useAccountsStore } from "../../stores/accounts";
import { useCatalogStore } from "../../stores/catalog";
import { useSettingsStore } from "../../stores/settings";
import { useUiStore } from "../../stores/ui";
import AccountDialog from "../accounts/AccountDialog.vue";
import TransactionDialog from "../transactions/TransactionDialog.vue";
import AppSidebar from "./AppSidebar.vue";
import AppTabBar from "./AppTabBar.vue";

const settings = useSettingsStore();
const accounts = useAccountsStore();
const catalog = useCatalogStore();
const ui = useUiStore();
const showError = useErrorToast();
const ready = ref(false);

onMounted(async () => {
  try {
    await Promise.all([settings.load(), accounts.load(), catalog.load(), ui.refreshCounts()]);
    ready.value = true;
  } catch (error) {
    showError(error);
  }
});
</script>

<template>
  <div class="shell">
    <AppSidebar class="shell__sidebar" />
    <main class="shell__main">
      <slot v-if="ready" />
      <div v-else class="shell__loading" aria-busy="true" />
    </main>
    <AppTabBar class="shell__tabbar" />
    <template v-if="ready">
      <AccountDialog />
      <TransactionDialog />
    </template>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  height: 100%;
}
.shell__main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.shell__tabbar {
  display: none;
}
.shell__loading {
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--surface-hover), transparent) 0 0 / 50% 2px
    no-repeat;
  animation: sweep 1.2s linear infinite;
}
@keyframes sweep {
  from {
    background-position: -50% 0;
  }
  to {
    background-position: 150% 0;
  }
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .shell__sidebar {
    display: none;
  }
  .shell__tabbar {
    display: grid;
    position: relative;
    z-index: 40;
  }
}
</style>
