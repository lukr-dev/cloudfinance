<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useMoney } from "../../composables/money";

const props = defineProps<{ amountMinor: number; currency: string; label: string }>();
const emit = defineEmits<{ commit: [amountMinor: number] }>();

const { t } = useI18n();
const { format, parse, toInput } = useMoney();
const editing = ref(false);
const draft = ref("");
const invalid = ref(false);

function focus(event: FocusEvent) {
  editing.value = true;
  invalid.value = false;
  draft.value = props.amountMinor === 0 ? "" : toInput(props.amountMinor, props.currency);
  requestAnimationFrame(() => (event.target as HTMLInputElement).select());
}

function commit(event: Event) {
  const value = draft.value.trim() === "" ? 0 : parse(draft.value, props.currency);
  if (value === null) {
    invalid.value = true;
    return;
  }
  editing.value = false;
  invalid.value = false;
  if (value !== props.amountMinor) emit("commit", value);
  if (event.type === "keydown") (event.target as HTMLInputElement).blur();
}

function cancel(event: KeyboardEvent) {
  draft.value = toInput(props.amountMinor, props.currency);
  editing.value = false;
  invalid.value = false;
  (event.target as HTMLInputElement).blur();
}
</script>

<template>
  <input
    class="assign num"
    inputmode="decimal"
    :aria-label="label"
    :aria-invalid="invalid"
    :title="invalid ? t('errors.invalidAmount') : undefined"
    :value="editing ? draft : format(amountMinor, currency)"
    @input="draft = ($event.target as HTMLInputElement).value"
    @focus="focus"
    @blur="editing && commit($event)"
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="cancel"
    @click.stop
  />
</template>

<style scoped>
.assign {
  width: 120px;
  height: 32px;
  margin-right: calc(-1 * var(--space-2));
  padding: 0 var(--space-2);
  text-align: right;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  cursor: text;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}
:global(tr:hover) .assign,
.assign:focus {
  border-color: var(--border-strong);
  background: var(--surface-raised);
}
.assign:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}
.assign[aria-invalid="true"] {
  border-color: var(--negative);
}
</style>
