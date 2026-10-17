<script setup lang="ts">
import { useToasts } from "../../composables/toasts";
import AppIcon from "./AppIcon.vue";

const { toasts, dismiss } = useToasts();
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast--${toast.tone}`"
        role="status"
        @click="dismiss(toast.id)"
      >
        <AppIcon :name="toast.tone === 'error' ? 'alert' : 'check'" :size="16" :stroke-width="2" />
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  bottom: var(--space-6);
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  gap: var(--space-2);
  z-index: 100;
}
.toast {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-4);
  border-radius: var(--radius-md);
  background: var(--ink);
  color: var(--text-inverse);
  box-shadow: var(--shadow-pop);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.toast--success :deep(svg) {
  color: var(--accent-hover);
}
.toast--error {
  background: var(--negative);
  color: #fff;
}
.toast-enter-active,
.toast-leave-active {
  transition: all var(--duration-base) var(--ease-out);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
