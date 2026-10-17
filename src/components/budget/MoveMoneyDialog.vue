<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { BudgetMonth } from "../../../shared/schemas";
import { useErrorToast } from "../../composables/errors";
import { useMoney } from "../../composables/money";
import { useToasts } from "../../composables/toasts";
import { useBudgetStore } from "../../stores/budget";
import FormField from "../ui/FormField.vue";
import UiButton from "../ui/UiButton.vue";
import UiDialog from "../ui/UiDialog.vue";

const RTA = "__rta__";
const props = defineProps<{ month: BudgetMonth; fromId: string | null }>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const { format, parse, toInput } = useMoney();
const budget = useBudgetStore();
const showError = useErrorToast();
const { push } = useToasts();

const from = ref(RTA);
const to = ref(RTA);
const amount = ref("");
const error = ref<string | null>(null);
const busy = ref(false);

const categories = computed(() =>
  props.month.groups.flatMap((g) => g.categories.map((c) => ({ ...c, group: g.name }))),
);
const byId = computed(() => new Map(categories.value.map((c) => [c.id, c])));

watch(open, (isOpen) => {
  if (!isOpen) return;
  from.value = props.fromId ?? RTA;
  to.value = RTA;
  const available = props.fromId ? (byId.value.get(props.fromId)?.available_minor ?? 0) : 0;
  amount.value = available > 0 ? toInput(available, props.month.currency) : "";
  error.value = null;
});

function availableOf(id: string) {
  return id === RTA
    ? props.month.ready_to_assign_minor
    : (byId.value.get(id)?.available_minor ?? 0);
}

async function submit() {
  const value = parse(amount.value, props.month.currency);
  if (value === null || value <= 0) {
    error.value = t("errors.invalidAmount");
    return;
  }
  if (from.value === to.value) return;
  busy.value = true;
  try {
    if (from.value === RTA) {
      const target = byId.value.get(to.value)!;
      await budget.assign(target.id, target.assigned_minor + value);
    } else if (to.value === RTA) {
      const source = byId.value.get(from.value)!;
      await budget.assign(source.id, source.assigned_minor - value);
    } else {
      await budget.move({
        from_category_id: from.value,
        to_category_id: to.value,
        amount_minor: value,
      });
    }
    push(t("move.done", { amount: format(value, props.month.currency, { code: true }) }));
    open.value = false;
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UiDialog v-model:open="open" :title="t('move.title')">
    <form id="move-form" class="grid" @submit.prevent="submit">
      <FormField v-slot="{ id }" :label="t('move.from')">
        <select :id="id" v-model="from" class="input">
          <option :value="RTA">
            {{ t("move.readyToAssign") }} ·
            {{ format(month.ready_to_assign_minor, month.currency) }}
          </option>
          <optgroup v-for="group in month.groups" :key="group.id" :label="group.name">
            <option v-for="c in group.categories" :key="c.id" :value="c.id">
              {{ c.name }} · {{ format(c.available_minor, month.currency) }}
            </option>
          </optgroup>
        </select>
      </FormField>
      <FormField v-slot="{ id }" :label="t('move.to')">
        <select :id="id" v-model="to" class="input">
          <option :value="RTA">
            {{ t("move.readyToAssign") }} ·
            {{ format(month.ready_to_assign_minor, month.currency) }}
          </option>
          <optgroup v-for="group in month.groups" :key="group.id" :label="group.name">
            <option v-for="c in group.categories" :key="c.id" :value="c.id">
              {{ c.name }} · {{ format(c.available_minor, month.currency) }}
            </option>
          </optgroup>
        </select>
      </FormField>
      <FormField v-slot="{ id }" :label="`${t('move.amount')} (${month.currency})`" :error="error">
        <input
          :id="id"
          v-model="amount"
          class="input num"
          inputmode="decimal"
          required
          :aria-invalid="!!error"
        />
      </FormField>
      <p class="faint hint num">
        {{ t("inspector.available") }}:
        {{ format(availableOf(from), month.currency, { code: true }) }}
      </p>
    </form>
    <template #footer>
      <UiButton @click="open = false">{{ t("common.cancel") }}</UiButton>
      <UiButton
        type="submit"
        form="move-form"
        variant="primary"
        :loading="busy"
        :disabled="from === to"
      >
        {{ t("move.submit") }}
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-4);
}
.hint {
  font-size: var(--text-sm);
  margin-top: calc(-1 * var(--space-2));
}
</style>
