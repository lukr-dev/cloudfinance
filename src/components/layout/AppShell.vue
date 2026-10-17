<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useErrorToast } from "../../composables/errors";
import { useAccountsStore } from "../../stores/accounts";
import { useCatalogStore } from "../../stores/catalog";
import { useSettingsStore } from "../../stores/settings";
import { useUiStore } from "../../stores/ui";
import AccountDialog from "../accounts/AccountDialog.vue";
import TransactionDialog from "../transactions/TransactionDialog.vue";
import AppSidebar from "./AppSidebar.vue";

const settings = useSettingsStore();
const accounts = useAccountsStore();
const catalog = useCatalogStore();
const ui = useUiStore();
const route = useRoute();
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

watch(
  () => route.fullPath,
  () => (ui.sidebarOpen = false),
);
</script>

<template>
  <div class="shell" :class="{ 'shell--nav-open': ui.sidebarOpen }">
    <AppSidebar class="shell__sidebar" />
    <div class="shell__scrim" @click="ui.sidebarOpen = false" />
    <main class="shell__main">
      <slot v-if="ready" />
      <div v-else class="shell__loading" aria-busy="true" />
    </main>
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
  height: 100%;
  overflow: hidden;
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
.shell__scrim {
  display: none;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
  }
  .shell__sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(var(--sidebar-width), 86vw);
    z-index: 40;
    transform: translateX(-100%);
    transition: transform var(--duration-base) var(--ease-out);
  }
  .shell--nav-open .shell__sidebar {
    transform: none;
    box-shadow: var(--shadow-pop);
  }
  .shell--nav-open .shell__scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(14, 16, 15, 0.32);
  }
}
</style>
