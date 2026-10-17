<script setup lang="ts">
import { useId } from "vue";

defineProps<{ label: string; hint?: string; error?: string | null }>();
const id = useId();
</script>

<template>
  <div class="field" :class="{ 'field--error': error }">
    <label :for="id" class="field__label">{{ label }}</label>
    <slot :id="id" />
    <p v-if="error" class="field__msg field__msg--error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="field__msg">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: 6px;
}
.field__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-muted);
}
.field__msg {
  font-size: var(--text-xs);
  color: var(--text-faint);
}
.field__msg--error {
  color: var(--negative);
}
</style>
