<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type {
  Attachment,
  ShareContact,
  ShareInput,
  TransactionCreate,
  TransactionResult,
  TransactionUpdate,
} from "../../../shared/schemas";
import { ApiError, api, upload } from "../../api/http";
import { useErrorToast } from "../../composables/errors";
import { useMoney } from "../../composables/money";
import { todayIso } from "../../composables/month";
import {
  formatPercent,
  parsePercent,
  previewSplit,
  type ShareDraft,
} from "../../composables/split";
import { useToasts } from "../../composables/toasts";
import { useAccountsStore } from "../../stores/accounts";
import { useCatalogStore } from "../../stores/catalog";
import { useUiStore } from "../../stores/ui";
import AttachmentList from "../attachments/AttachmentList.vue";
import FormField from "../ui/FormField.vue";
import SegmentedControl from "../ui/SegmentedControl.vue";
import UiButton from "../ui/UiButton.vue";
import UiDialog from "../ui/UiDialog.vue";
import CategoryOptions from "./CategoryOptions.vue";
import SharePanel from "./SharePanel.vue";

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
const errors = ref<{ amount?: string; transferAmount?: string; share?: string }>({});
const share = ref<ShareDraft>({ method: "equal", people: [] });
/** The draft as loaded, so an untouched split isn't resent (that would re-activate declines). */
let initialShare = "";
const contacts = ref<ShareContact[]>([]);
const busy = ref(false);
const confirmDelete = ref(false);
const payees = ref<string[]>([]);
const pendingFiles = ref<File[]>([]);
let attachmentsChanged = false;
/** Bumped on every open, so a slow save can't close or feed files into a newer dialog. */
let generation = 0;

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
/** Only regular entries in on-budget accounts can be split. */
const shareable = computed(
  () =>
    kind.value !== "transfer" &&
    account.value?.on_budget === true &&
    (!categoryId.value || categoryId.value !== catalog.repayment?.id),
);
const total = computed(() => {
  const value = parse(amount.value, currency.value);
  return value === null ? 0 : kind.value === "income" ? Math.abs(value) : -Math.abs(value);
});
const showCategory = computed(() =>
  kind.value === "transfer" ? transferNeedsCategory.value : account.value?.on_budget !== false,
);

watch(open, async (isOpen) => {
  if (!isOpen) {
    if (attachmentsChanged) ui.changed();
    return;
  }
  generation++;
  pendingFiles.value = [];
  attachmentsChanged = false;
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
    share.value = tx.share
      ? {
          method: tx.share.split_method,
          people: tx.share.participants.map((p) => ({
            email: p.email,
            name: p.name,
            status: p.status,
            value:
              tx.share!.split_method === "percent" && p.percent_bp !== null
                ? formatPercent(p.percent_bp)
                : tx.share!.split_method === "amount"
                  ? toInput(Math.abs(p.amount_minor), tx.currency)
                  : "",
          })),
        }
      : { method: "equal", people: [] };
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
    share.value = { method: "equal", people: [] };
  }
  initialShare = JSON.stringify(share.value);
  [payees.value, contacts.value] = await Promise.all([
    api<string[]>("GET", "/payees").catch(() => []),
    api<ShareContact[]>("GET", "/share-contacts").catch(() => []),
  ]);
});

watch(kind, (next, previous) => {
  if (editing.value || next === previous) return;
  if (next === "income") categoryId.value = catalog.income?.id ?? "";
  else if (previous === "income") categoryId.value = "";
});

/** undefined = leave the split as it is; null = stop sharing. */
function buildShare(): ShareInput | null | undefined | false {
  const draft = share.value;
  if (!shareable.value || !draft.people.length) return editing.value?.share ? null : undefined;
  if (editing.value && JSON.stringify(draft) === initialShare) return undefined;
  const values = draft.people.map((p) =>
    draft.method === "percent"
      ? parsePercent(p.value)
      : draft.method === "amount"
        ? parse(p.value, currency.value)
        : null,
  );
  const preview = previewSplit(total.value, draft.method, values);
  if (preview.error || draft.people.some((p) => !p.email.trim())) {
    errors.value.share = t(preview.error === "over" ? "share.overShort" : "share.incomplete");
    return false;
  }
  return {
    split_method: draft.method,
    participants: draft.people.map((p, i) => ({
      email: p.email.trim(),
      ...(draft.method === "percent" ? { percent_bp: values[i]! } : {}),
      ...(draft.method === "amount" ? { amount_minor: preview.shares[i]! } : {}),
    })),
  };
}

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
  const shareInput = buildShare();
  if (shareInput === false) return;
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

  const run = generation;
  const sourceAccountId = accountId.value;
  const files = [...pendingFiles.value];
  let failed: string[] = [];
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
      if (shareInput !== undefined) patch.share = shareInput;
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
        if (shareInput) body.share = shareInput;
      }
      const result = await api<TransactionResult>("POST", "/transactions", { body });
      const created = result.created.find((tx) => tx.account_id === sourceAccountId);
      failed = created ? await uploadFiles(created.id, files) : files.map((f) => f.name);
    }
    push(t("transactions.savedToast"));
    if (failed.length)
      push(t("attachments.uploadFailed", { names: failed.join(", ") }, failed.length), "error");
    if (run === generation) open.value = false;
    await accounts.load();
    ui.changed();
  } catch (e) {
    if (e instanceof ApiError && e.code === "SHARE_RECIPIENT_NOT_FOUND")
      errors.value.share = t("errors.SHARE_RECIPIENT_NOT_FOUND");
    else showError(e);
  } finally {
    busy.value = false;
  }
}

/** Files picked before the transaction existed; returns the names that failed to upload. */
async function uploadFiles(transactionId: string, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.set("file", file);
    form.set("transaction_id", transactionId);
    await upload<Attachment>("/attachments", form).catch(() => failed.push(file.name));
  }
  return failed;
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
    :width="560"
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
          <CategoryOptions :repayment="!share.people.length" />
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

      <div v-if="shareable" class="span-2">
        <SharePanel
          v-model="share"
          :total="total"
          :currency="currency"
          :contacts="contacts"
          :error="errors.share"
        />
      </div>

      <FormField v-slot="{ id }" class="span-2" :label="t('transactions.memo')">
        <input :id="id" v-model="memo" class="input" maxlength="4000" />
      </FormField>
      <div class="span-2 attach">
        <span class="attach__label">{{ t("attachments.title") }}</span>
        <AttachmentList
          v-model:pending="pendingFiles"
          :transaction-id="editing?.id"
          @changed="attachmentsChanged = true"
        />
      </div>
      <label class="checkbox span-2"
        ><input v-model="cleared" type="checkbox" />{{ t("transactions.cleared") }}</label
      >

      <p v-if="confirmDelete" class="span-2 confirm">
        {{
          editing?.attachment_count
            ? t("transactions.deleteConfirmFiles", editing.attachment_count)
            : t("transactions.deleteConfirm")
        }}
      </p>
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
.attach {
  display: grid;
  gap: 6px;
}
.attach__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-muted);
}
.kind:empty {
  display: none;
}
@media (max-width: 760px) {
  .kind :deep(.segmented) {
    display: flex;
  }
  .kind :deep(.segmented button) {
    flex: 1;
    justify-content: center;
    height: 32px;
  }
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
