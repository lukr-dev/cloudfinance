<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { TransactionCreate, TransactionUpdate } from "../../../shared/schemas";
import { api } from "../../api/http";
import { useErrorToast } from "../../composables/errors";
import { useMoney } from "../../composables/money";
import { todayIso } from "../../composables/month";
import { useToasts } from "../../composables/toasts";
import { useAccountsStore } from "../../stores/accounts";
import { useCatalogStore } from "../../stores/catalog";
import { useUiStore } from "../../stores/ui";
import FormField from "../ui/FormField.vue";
import SegmentedControl from "../ui/SegmentedControl.vue";
import UiButton from "../ui/UiButton.vue";
import UiDialog from "../ui/UiDialog.vue";

type Kind = "expense" | "income" | "transfer";

const { t } = useI18n();
const { parse, toInput } = useMoney();
const ui = useUiStore();
const accounts = useAccountsStore();
const catalog = useCatalogStore();
const showError = useErrorToast();
const { push } = useToasts();

const state = computed(() => ui.transactionDialog);
const editing = computed(() => state.value.transaction);
const open = computed({
  get: () => state.value.open,
  set: (value: boolean) => (ui.transactionDialog = { ...ui.transactionDialog, open: value }),
});

const kind = ref<Kind>("expense");
const accountId = ref("");
const date = ref(todayIso());
const payee = ref("");
const categoryId = ref<string>("");
const amount = ref("");
const transferAccountId = ref("");
const transferAmount = ref("");
const memo = ref("");
const cleared = ref(false);
const errors = ref<{ amount?: string; transferAmount?: string }>({});
const busy = ref(false);
const confirmDelete = ref(false);
const payees = ref<string[]>([]);

const account = computed(() => accounts.byId.get(accountId.value));
const transferAccount = computed(() => accounts.byId.get(transferAccountId.value));
const currency = computed(() => account.value?.currency ?? "CHF");
const crossCurrency = computed(
  () =>
    kind.value === "transfer" &&
    !!transferAccount.value &&
    transferAccount.value.currency !== currency.value,
);
/** Transfers between on- and off-budget accounts need a category on the budget side. */
const transferNeedsCategory = computed(
  () =>
    kind.value === "transfer" &&
    !!account.value &&
    !!transferAccount.value &&
    account.value.on_budget !== transferAccount.value.on_budget,
);
const showCategory = computed(() =>
  kind.value === "transfer" ? transferNeedsCategory.value : account.value?.on_budget !== false,
);

watch(open, async (isOpen) => {
  if (!isOpen) return;
  const tx = editing.value;
  const defaults = state.value.defaults;
  errors.value = {};
  confirmDelete.value = false;
  if (tx) {
    kind.value = tx.transfer_account_id ? "transfer" : tx.amount_minor > 0 ? "income" : "expense";
    accountId.value = tx.account_id;
    date.value = tx.date;
    payee.value = tx.payee;
    categoryId.value = tx.category_id ?? "";
    amount.value = toInput(Math.abs(tx.amount_minor), tx.currency);
    transferAccountId.value = tx.transfer_account_id ?? "";
    transferAmount.value = "";
    memo.value = tx.memo;
    cleared.value = tx.cleared !== "uncleared";
  } else {
    kind.value = "expense";
    accountId.value = defaults.account_id ?? accounts.onBudget[0]?.id ?? accounts.open[0]?.id ?? "";
    date.value = todayIso();
    payee.value = "";
    categoryId.value = defaults.category_id ?? "";
    amount.value = "";
    transferAccountId.value = "";
    transferAmount.value = "";
    memo.value = "";
    cleared.value = false;
  }
  payees.value = await api<string[]>("GET", "/payees").catch(() => []);
});

watch(kind, (next, previous) => {
  if (editing.value || next === previous) return;
  if (next === "income") categoryId.value = catalog.income?.id ?? "";
  else if (previous === "income") categoryId.value = "";
});

function buildCategory(): string | null {
  if (!showCategory.value) return null;
  return categoryId.value || null;
}

async function save() {
  errors.value = {};
  const value = parse(amount.value, currency.value);
  if (value === null || value <= 0) {
    errors.value.amount = t("errors.invalidAmount");
    return;
  }
  const signed = kind.value === "income" ? value : -value;
  let received: number | undefined;
  if (crossCurrency.value) {
    const parsed = parse(transferAmount.value, transferAccount.value!.currency);
    if (parsed === null || parsed <= 0) {
      if (!editing.value) {
        errors.value.transferAmount = t("errors.invalidAmount");
        return;
      }
    } else {
      received = parsed;
    }
  }

  busy.value = true;
  try {
    if (editing.value) {
      const patch: TransactionUpdate = {
        date: date.value,
        amount_minor: signed,
        payee: payee.value,
        memo: memo.value,
        cleared: cleared.value ? "cleared" : "uncleared",
      };
      if (kind.value !== "transfer" || transferNeedsCategory.value)
        patch.category_id = buildCategory();
      if (received !== undefined) patch.transfer_amount_minor = received;
      await api("PATCH", `/transactions/${editing.value.id}`, { body: patch });
    } else {
      const body: TransactionCreate = {
        account_id: accountId.value,
        date: date.value,
        amount_minor: signed,
        payee: payee.value || undefined,
        memo: memo.value || undefined,
        cleared: cleared.value ? "cleared" : "uncleared",
        source: "manual",
      };
      if (kind.value === "transfer") {
        body.transfer_account_id = transferAccountId.value;
        if (received !== undefined) body.transfer_amount_minor = received;
        if (transferNeedsCategory.value) {
          // The category belongs to whichever side is on-budget.
          if (account.value?.on_budget) body.category_id = buildCategory();
          else body.transfer_category_id = buildCategory();
        }
      } else {
        body.category_id = buildCategory();
      }
      await api("POST", "/transactions", { body });
    }
    push(t("transactions.savedToast"));
    open.value = false;
    await accounts.load();
    ui.changed();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!editing.value) return;
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  busy.value = true;
  try {
    await api("DELETE", `/transactions/${editing.value.id}`);
    push(t("transactions.deleted"));
    open.value = false;
    await accounts.load();
    ui.changed();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

const kindOptions = computed(() => [
  { value: "expense" as const, label: t("transactions.kindExpense") },
  { value: "income" as const, label: t("transactions.kindIncome") },
  { value: "transfer" as const, label: t("transactions.kindTransfer") },
]);
</script>

<template>
  <UiDialog
    v-model:open="open"
    :title="editing ? t('transactions.editTitle') : t('transactions.newTitle')"
    :width="520"
  >
    <form id="tx-form" class="form-grid" @submit.prevent="save">
      <div class="span-2 kind">
        <SegmentedControl
          v-if="!editing"
          v-model="kind"
          :label="t('transactions.kind')"
          :options="kindOptions"
        />
      </div>

      <FormField
        v-slot="{ id }"
        :label="kind === 'transfer' ? t('transactions.transferFrom') : t('transactions.account')"
      >
        <select :id="id" v-model="accountId" class="input" required :disabled="!!editing">
          <option v-for="a in accounts.open" :key="a.id" :value="a.id">
            {{ a.name }} · {{ a.currency }}
          </option>
        </select>
      </FormField>
      <FormField v-slot="{ id }" :label="t('transactions.date')">
        <input :id="id" v-model="date" class="input" type="date" required />
      </FormField>

      <template v-if="kind === 'transfer'">
        <FormField v-slot="{ id }" class="span-2" :label="t('transactions.transferTo')">
          <select :id="id" v-model="transferAccountId" class="input" required :disabled="!!editing">
            <option value="" disabled />
            <option
              v-for="a in accounts.open.filter((x) => x.id !== accountId)"
              :key="a.id"
              :value="a.id"
            >
              {{ a.name }} · {{ a.currency }}
            </option>
          </select>
        </FormField>
      </template>
      <FormField v-else v-slot="{ id }" class="span-2" :label="t('transactions.payee')">
        <input
          :id="id"
          v-model="payee"
          class="input"
          list="payee-options"
          autocomplete="off"
          maxlength="200"
        />
        <datalist id="payee-options">
          <option v-for="p in payees" :key="p" :value="p" />
        </datalist>
      </FormField>

      <FormField
        v-if="showCategory"
        v-slot="{ id }"
        class="span-2"
        :label="t('transactions.category')"
      >
        <select :id="id" v-model="categoryId" class="input">
          <option value="">{{ t("transactions.uncategorized") }}</option>
          <option v-if="catalog.income" :value="catalog.income.id">
            {{ t("transactions.readyToAssign") }}
          </option>
          <optgroup
            v-for="entry in catalog.grouped"
            :key="entry.group.id"
            :label="entry.group.name"
          >
            <option v-for="c in entry.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </optgroup>
        </select>
      </FormField>

      <FormField
        v-slot="{ id }"
        :class="{ 'span-2': !crossCurrency }"
        :label="`${kind === 'income' ? t('transactions.inflow') : kind === 'transfer' ? t('transactions.amount') : t('transactions.outflow')} (${currency})`"
        :error="errors.amount"
      >
        <input
          :id="id"
          v-model="amount"
          class="input num"
          inputmode="decimal"
          required
          :aria-invalid="!!errors.amount"
          placeholder="0.00"
        />
      </FormField>
      <FormField
        v-if="crossCurrency"
        v-slot="{ id }"
        :label="`${t('transactions.transferAmount')} (${transferAccount?.currency})`"
        :hint="t('transactions.transferAmountHint', { currency: transferAccount?.currency })"
        :error="errors.transferAmount"
      >
        <input
          :id="id"
          v-model="transferAmount"
          class="input num"
          inputmode="decimal"
          :aria-invalid="!!errors.transferAmount"
          placeholder="0.00"
        />
      </FormField>

      <FormField v-slot="{ id }" class="span-2" :label="t('transactions.memo')">
        <input :id="id" v-model="memo" class="input" maxlength="4000" />
      </FormField>
      <label class="checkbox span-2"
        ><input v-model="cleared" type="checkbox" />{{ t("transactions.cleared") }}</label
      >

      <p v-if="confirmDelete" class="span-2 confirm">{{ t("transactions.deleteConfirm") }}</p>
    </form>
    <template #footer>
      <UiButton
        v-if="editing"
        variant="danger"
        icon="trash"
        class="push-left"
        :loading="busy && confirmDelete"
        @click="remove"
      >
        {{ t("common.delete") }}
      </UiButton>
      <UiButton @click="open = false">{{ t("common.cancel") }}</UiButton>
      <UiButton type="submit" form="tx-form" variant="primary" :loading="busy && !confirmDelete">
        {{ t("common.save") }}
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.kind:empty {
  display: none;
}
.confirm {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--negative-soft);
  color: var(--negative);
  font-size: 0.875rem;
}
.push-left {
  margin-right: auto;
}
</style>
