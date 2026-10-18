<script setup lang="ts">
import AppIcon, { type IconName } from "./AppIcon.vue";

withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    icon?: IconName;
    type?: "button" | "submit";
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    /** Icon only on narrow screens; the label stays for screen readers. */
    compact?: boolean;
  }>(),
  { variant: "secondary", size: "md", type: "button" },
);
</script>

<template>
  <button
    :type="type"
    class="ui-button"
    :class="[
      `ui-button--${variant}`,
      `ui-button--${size}`,
      { 'ui-button--block': block, 'ui-button--compact': compact && icon },
    ]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" :size="size === 'sm' ? 14 : 16" :stroke-width="2" />
    <span class="ui-button__label"><slot /></span>
  </button>
</template>

<style scoped>
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  background: var(--surface-raised);
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}
.ui-button:hover:not(:disabled) {
  border-color: var(--text-faint);
}
.ui-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ui-button--sm {
  height: 30px;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
}
.ui-button--block {
  width: 100%;
}
.ui-button--primary {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--text-inverse);
}
.ui-button--primary:hover:not(:disabled) {
  background: var(--ink-hover);
  border-color: var(--ink-hover);
}
.ui-button--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-muted);
}
.ui-button--ghost:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: transparent;
  color: var(--text);
}
.ui-button--danger {
  color: var(--negative);
}
.ui-button--danger:hover:not(:disabled) {
  border-color: var(--negative);
  background: var(--negative-soft);
}
.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: spin 700ms linear infinite;
}
@media (max-width: 900px) {
  .ui-button {
    height: 40px;
  }
  .ui-button--sm {
    height: 34px;
  }
}
@media (max-width: 760px) {
  .ui-button--compact {
    width: 40px;
    padding: 0;
  }
  .ui-button--compact .ui-button__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
