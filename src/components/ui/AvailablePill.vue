<script setup lang="ts">
import { computed } from "vue";
import { useMoney } from "../../composables/money";

const props = defineProps<{ amountMinor: number; currency: string }>();
const { format } = useMoney();
const tone = computed(() =>
  props.amountMinor > 0 ? "positive" : props.amountMinor < 0 ? "negative" : "zero",
);
</script>

<template>
  <span class="pill num" :class="`pill--${tone}`">{{ format(amountMinor, currency) }}</span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 96px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  font-size: 0.875rem;
}
.pill--positive {
  background: var(--positive-soft);
  color: var(--positive);
}
.pill--zero {
  color: var(--text-faint);
  font-weight: 500;
}
.pill--negative {
  background: var(--negative-soft);
  color: var(--negative);
}
</style>
