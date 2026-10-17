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
    :style="{ width: `min(${props.width}px, calc(100vw - 32px))` }"
    @close="open = false"
    @click="onBackdrop"
  >
    <div class="ui-dialog__inner">
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
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  color: var(--text);
  box-shadow: var(--shadow-pop);
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
.ui-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-4) var(--space-2) var(--space-6);
}
.ui-dialog__head h2 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 1.25rem;
  letter-spacing: -0.01em;
}
.ui-dialog__body {
  padding: var(--space-2) var(--space-6) var(--space-6);
  display: grid;
  gap: var(--space-4);
}
.ui-dialog__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--border);
  background: var(--surface-canvas);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}
</style>
