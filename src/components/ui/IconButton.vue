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
/* Larger touch target; :where keeps parent size overrides (chips, table rows) winning. */
@media (pointer: coarse) {
  :where(.icon-button) {
    width: 40px;
    height: 40px;
  }
}
.icon-button:hover {
  background: var(--surface-hover);
  color: var(--text);
}
</style>
