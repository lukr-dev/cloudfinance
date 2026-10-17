<script setup lang="ts">
import { RouterView, useRoute } from "vue-router";
import AppShell from "./components/layout/AppShell.vue";
import ToastHost from "./components/ui/ToastHost.vue";

const route = useRoute();
</script>

<template>
  <RouterView v-if="route.meta.public" />
  <AppShell v-else-if="route.matched.length">
    <RouterView />
  </AppShell>
  <ToastHost />
</template>
