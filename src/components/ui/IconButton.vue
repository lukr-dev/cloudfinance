<script setup lang="ts">
import AppIcon, { type IconName } from "./AppIcon.vue";

withDefaults(defineProps<{ icon: IconName; label: string; size?: number }>(), { size: 16 });
</script>

<template>
  <button type="button" class="icon-button" :aria-label="label" :title="label">
    <AppIcon :name="icon" :size="size" :stroke-width="2" />
  </button>
</template>

<style scoped>
.icon-button {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border: 0;
  background: none;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  cursor: pointer;
}
.icon-button:hover {
  background: var(--surface-hover);
  color: var(--text);
}
</style>
