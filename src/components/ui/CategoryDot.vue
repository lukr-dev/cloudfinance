<script setup lang="ts">
defineProps<{ color?: string | null; size?: number }>();
</script>

<template>
  <span
    class="dot"
    :style="{
      background: `var(--cat-${color ?? 'slate'})`,
      width: `${size ?? 9}px`,
      height: `${size ?? 9}px`,
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.dot {
  display: inline-block;
  border-radius: 50%;
  flex: none;
}
</style>
