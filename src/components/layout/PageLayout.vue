<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useUiStore } from "../../stores/ui";
import IconButton from "../ui/IconButton.vue";

defineProps<{ title: string; wide?: boolean; inspectorOpen?: boolean }>();
const { t } = useI18n();
const ui = useUiStore();
</script>

<template>
  <div
    class="page"
    :class="{ 'page--inspector': $slots.inspector, 'page--inspector-open': inspectorOpen }"
  >
    <div class="page__main">
      <header class="page__header">
        <IconButton
          class="page__menu"
          icon="budget"
          :label="t('nav.collapse')"
          @click="ui.sidebarOpen = true"
        />
        <h1 class="page__title">{{ title }}</h1>
        <div class="page__actions"><slot name="actions" /></div>
      </header>
      <div class="page__scroll">
        <div class="page__content" :class="{ 'page__content--wide': wide }"><slot /></div>
      </div>
      <footer v-if="$slots.status" class="page__status"><slot name="status" /></footer>
    </div>
    <aside v-if="$slots.inspector" class="page__inspector"><slot name="inspector" /></aside>
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
  height: var(--topbar-height);
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-8);
  border-bottom: 1px solid var(--border);
}
.page__menu {
  display: none;
  margin-left: calc(-1 * var(--space-2));
}
.page__title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--text-xl);
  letter-spacing: -0.015em;
  margin-right: auto;
  white-space: nowrap;
}
.page__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.page__scroll {
  flex: 1;
  overflow-y: auto;
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
.page__inspector {
  background: var(--surface-sunken);
  border-left: 1px solid var(--border);
  overflow-y: auto;
}

@media (max-width: 1180px) {
  .page--inspector {
    grid-template-columns: minmax(0, 1fr);
  }
  /* Narrow screens: the inspector slides over the content while something is selected. */
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
}
@media (max-width: 900px) {
  .page__menu {
    display: inline-grid;
  }
  .page__header {
    padding: 0 var(--space-4);
    gap: var(--space-2);
  }
  .page__content {
    padding: var(--space-5) var(--space-4);
  }
  .page__status {
    padding: 0 var(--space-4);
  }
}
</style>
