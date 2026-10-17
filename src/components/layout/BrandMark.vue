<script setup lang="ts">
defineProps<{ compact?: boolean }>();
</script>

<template>
  <div class="brand" :class="{ 'brand--compact': compact }">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 18.5h9a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7.5 18.5Z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path
        d="M12 16v-5m0 0-2 2m2-2 2 2"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <span v-if="!compact">cloudfinance</span>
  </div>
</template>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 1.25rem;
  letter-spacing: -0.01em;
  color: var(--text);
}
.brand svg {
  color: var(--accent);
}
</style>
