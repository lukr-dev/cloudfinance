<script setup lang="ts" generic="T extends string">
import AppIcon, { type IconName } from "./AppIcon.vue";

defineProps<{
  options: { value: T; label: string; icon?: IconName }[];
  label: string;
  iconOnly?: boolean;
}>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :aria-label="iconOnly ? option.label : undefined"
      :title="iconOnly ? option.label : undefined"
      @click="model = option.value"
    >
      <AppIcon v-if="option.icon" :name="option.icon" :size="14" :stroke-width="2" />
      <span v-if="!iconOnly">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: none;
  cursor: pointer;
  height: 26px;
  padding: 0 10px;
  border-radius: 5px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
button:hover {
  color: var(--text);
}
button[aria-checked="true"] {
  background: var(--ink);
  color: var(--text-inverse);
}
</style>
