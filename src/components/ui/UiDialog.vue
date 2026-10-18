<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import IconButton from "./IconButton.vue";

const props = withDefaults(defineProps<{ title: string; width?: number }>(), { width: 440 });
const open = defineModel<boolean>("open", { required: true });
const dialog = ref<HTMLDialogElement>();

function sync() {
  const el = dialog.value;
  if (!el) return;
  if (open.value && !el.open) el.showModal();
  if (!open.value && el.open) el.close();
}
watch(open, sync);
onMounted(sync);

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) open.value = false;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="ui-dialog"
    :style="{ '--dialog-width': `${props.width}px` }"
    @close="open = false"
    @click="onBackdrop"
  >
    <!-- Initial focus lands here, not on the close button or a field (no keyboard pop-up). -->
    <div class="ui-dialog__inner" tabindex="-1" autofocus>
      <header class="ui-dialog__head">
        <h2>{{ title }}</h2>
        <IconButton icon="close" :label="$t('common.close')" @click="open = false" />
      </header>
      <div class="ui-dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="ui-dialog__foot"><slot name="footer" /></footer>
    </div>
  </dialog>
</template>

<style scoped>
.ui-dialog {
  width: min(var(--dialog-width), calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  color: var(--text);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}
.ui-dialog::backdrop {
  background: rgba(14, 16, 15, 0.32);
}
.ui-dialog[open] {
  animation: rise var(--duration-base) var(--ease-out);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
@keyframes sheet {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}
.ui-dialog__inner {
  display: flex;
  flex-direction: column;
  max-height: inherit;
}
.ui-dialog__inner:focus {
  outline: none;
  box-shadow: none;
}
.ui-dialog__head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-2) var(--space-6);
}
.ui-dialog__head h2 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 1.25rem;
  letter-spacing: -0.01em;
}
.ui-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-2) var(--space-6) var(--space-6);
  display: grid;
  align-content: start;
  gap: var(--space-4);
}
.ui-dialog__foot {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--border);
  background: var(--surface-canvas);
}

/* Phones: a bottom sheet with the actions under the thumb. */
@media (max-width: 760px) {
  .ui-dialog {
    width: 100%;
    max-width: none;
    max-height: calc(100dvh - 24px);
    margin: auto 0 0;
    border-width: 1px 0 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  .ui-dialog[open] {
    animation-name: sheet;
  }
  .ui-dialog__head {
    padding: var(--space-3) var(--space-2) var(--space-1) var(--space-5);
  }
  .ui-dialog__body {
    padding: var(--space-2) var(--space-5) var(--space-5);
  }
  .ui-dialog__foot {
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-5) calc(var(--space-3) + env(safe-area-inset-bottom));
  }
}
</style>
