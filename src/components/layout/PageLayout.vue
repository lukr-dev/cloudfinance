<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

const props = defineProps<{ title: string; wide?: boolean; inspectorOpen?: boolean }>();
const emit = defineEmits<{ closeInspector: [] }>();

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape" && props.inspectorOpen && !document.querySelector("dialog[open]")) {
    emit("closeInspector");
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div
    class="page"
    :class="{ 'page--inspector': $slots.inspector, 'page--inspector-open': inspectorOpen }"
  >
    <div class="page__main">
      <header class="page__header" :class="{ 'page__header--toolbar': $slots.toolbar }">
        <h1 class="page__title">{{ title }}</h1>
        <div v-if="$slots.toolbar" class="page__toolbar"><slot name="toolbar" /></div>
        <div class="page__actions"><slot name="actions" /></div>
      </header>
      <div class="page__scroll">
        <div class="page__content" :class="{ 'page__content--wide': wide }"><slot /></div>
      </div>
      <footer v-if="$slots.status" class="page__status"><slot name="status" /></footer>
    </div>
    <template v-if="$slots.inspector">
      <div class="page__scrim" aria-hidden="true" @click="emit('closeInspector')" />
      <aside class="page__inspector"><slot name="inspector" /></aside>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: 100%;
}
.page--inspector {
  grid-template-columns: minmax(0, 1fr) var(--inspector-width);
}
.page__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.page__header {
  min-height: var(--topbar-height);
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-8);
  border-bottom: 1px solid var(--border);
}
.page__title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--text-xl);
  letter-spacing: -0.015em;
  margin-right: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page__toolbar,
.page__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: none;
}
.page__scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.page__content {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-8);
}
.page__content--wide {
  max-width: none;
}
.page__status {
  flex: none;
  height: 36px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 var(--space-8);
  font-size: var(--text-xs);
  color: var(--text-faint);
}
/* Status content is optional (e.g. no agent activity yet); comments count as empty. */
.page__status:empty {
  display: none;
}
.page__inspector {
  background: var(--surface-sunken);
  border-left: 1px solid var(--border);
  overflow-y: auto;
}
.page__scrim {
  display: none;
}

/* Narrow: the inspector slides over the content while something is selected. */
@media (max-width: 1180px) {
  .page--inspector {
    grid-template-columns: minmax(0, 1fr);
  }
  .page__inspector {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(var(--inspector-width), 92vw);
    z-index: 20;
    box-shadow: var(--shadow-pop);
    transform: translateX(100%);
    visibility: hidden;
    transition:
      transform var(--duration-base) var(--ease-out),
      visibility var(--duration-base);
  }
  .page--inspector-open .page__inspector {
    transform: none;
    visibility: visible;
  }
  .page--inspector-open .page__scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 19;
    background: rgba(14, 16, 15, 0.32);
  }
}

@media (max-width: 900px) {
  .page__header {
    min-height: 56px;
    padding: 0 var(--space-4);
    gap: var(--space-2);
  }
  .page__title {
    font-size: 1.375rem;
  }
  .page__content {
    padding: var(--space-5) var(--space-4) var(--space-8);
  }
  .page__status {
    display: none;
  }
  /* Phones and small tablets: the inspector is a bottom sheet above the tab bar. */
  .page__inspector {
    inset: auto 0 0 0;
    width: 100%;
    max-height: 85dvh;
    border-left: 0;
    border-top: 1px solid var(--border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 50;
    transform: translateY(100%);
  }
  .page--inspector-open .page__scrim {
    z-index: 49;
  }
}

@media (max-width: 760px) {
  /* Title and actions on top, the toolbar (month, currency, …) gets its own row. */
  .page__header--toolbar {
    flex-wrap: wrap;
    row-gap: var(--space-1);
    padding-top: var(--space-2);
    padding-bottom: var(--space-2);
  }
  .page__header--toolbar .page__toolbar {
    order: 3;
    flex: 1 0 100%;
    justify-content: space-between;
  }
}
</style>
