<script setup lang="ts">
/** Hand-drawn 24px line icons; stroke follows currentColor. */
const paths = {
  budget: "M4 7h16M4 12h16M4 17h10",
  transactions: "M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3",
  accounts: "M5.5 6h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM3.5 10h17",
  agents: "M9 7 4 12l5 5M15 7l5 5-5 5",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  "chevron-left": "m15 6-6 6 6 6",
  "chevron-right": "m9 6 6 6-6 6",
  "chevron-down": "m6 9 6 6 6-6",
  close: "M6 6l12 12M18 6 6 18",
  check: "m5 12.5 4.5 4.5L19 7.5",
  copy: "M9 9h10v10H9zM5 15V5h10",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4",
  key: "M14.5 9.5a4 4 0 1 1-1.2-2.8M14.5 9.5 21 16v3h-3v-2h-2v-2h-2l-1.6-1.6M8.5 9.5h.01",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  monitor: "M4 5h16v11H4zM9 20h6m-3-4v4",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4",
  fingerprint:
    "M7 11a5 5 0 0 1 10 0c0 3-.5 5.5-1.5 7.5M12 11c0 3.5-.6 6.5-2 9M9.5 11a2.5 2.5 0 0 1 5 0c0 1.5-.1 3-.4 4.4M4.5 15c.3-1.3.5-2.6.5-4a7 7 0 0 1 12.5-4.3M19 11c0 1.6-.1 3.1-.4 4.5",
  alert:
    "M12 9v4m0 4h.01M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  arrows: "M7 7h13m0 0-3-3m3 3-3 3M17 17H4m0 0 3-3m-3 3 3 3",
  transfer: "M4 9h15m0 0-4-4m4 4-4 4M20 15H5m0 0 4-4m-4 4 4 4",
  inbox: "M4 13h4l1.5 3h5L16 13h4M5 5h14l1 8v6H4v-6l1-8Z",
  external: "M14 5h5v5M19 5l-8 8M11 5H5v14h14v-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
} as const;

export type IconName = keyof typeof paths;

withDefaults(defineProps<{ name: IconName; size?: number; strokeWidth?: number }>(), {
  size: 18,
  strokeWidth: 1.7,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="app-icon"
  >
    <path :d="paths[name]" />
  </svg>
</template>

<style scoped>
.app-icon {
  flex: none;
}
</style>
