<script setup lang="ts">
import AppIcon, { type IconName } from "./AppIcon.vue";

defineProps<{ icon?: IconName; title: string; body?: string }>();
</script>

<template>
  <div class="empty">
    <span v-if="icon" class="empty__icon"><AppIcon :name="icon" :size="20" /></span>
    <h3>{{ title }}</h3>
    <p v-if="body">{{ body }}</p>
    <div v-if="$slots.default" class="empty__actions"><slot /></div>
  </div>
</template>

<style scoped>
.empty {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-12) var(--space-6);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
}
.empty__icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: var(--space-2);
}
h3 {
  font-size: var(--text-lg);
  font-weight: 600;
}
p {
  color: var(--text-muted);
  max-width: 44ch;
}
.empty__actions {
  margin-top: var(--space-3);
  display: flex;
  gap: var(--space-2);
}
</style>
