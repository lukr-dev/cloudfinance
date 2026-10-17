<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { Account } from "../../../shared/schemas";
import { api } from "../../api/http";
import { useErrorToast } from "../../composables/errors";
import { useMoney } from "../../composables/money";
import { todayIso } from "../../composables/month";
import { useAccountsStore } from "../../stores/accounts";
import { useCatalogStore } from "../../stores/catalog";
import { useSettingsStore } from "../../stores/settings";
import { useUiStore } from "../../stores/ui";
import FormField from "../ui/FormField.vue";
import UiButton from "../ui/UiButton.vue";
import UiDialog from "../ui/UiDialog.vue";

const TYPES = ["checking", "savings", "credit_card", "cash", "investment", "other"] as const;

const { t } = useI18n();
const { parse } = useMoney();
const ui = useUiStore();
const accounts = useAccountsStore();
const catalog = useCatalogStore();
const settings = useSettingsStore();
const showError = useErrorToast();

const editing = computed(() => ui.accountDialog.account);
const open = computed({
  get: () => ui.accountDialog.open,
  set: (value: boolean) => (ui.accountDialog = { ...ui.accountDialog, open: value }),
});

const name = ref("");
const type = ref<Account["type"]>("checking");
const currency = ref("CHF");
const institution = ref("");
const onBudget = ref(true);
const opening = ref("");
const openingError = ref<string | null>(null);
const busy = ref(false);
const confirmDelete = ref(false);

watch(open, (isOpen) => {
  if (!isOpen) return;
  const a = editing.value;
  name.value = a?.name ?? "";
  type.value = a?.type ?? "checking";
  currency.value = a?.currency ?? settings.settings?.base_currency ?? "CHF";
  institution.value = a?.institution ?? "";
  onBudget.value = a?.on_budget ?? true;
  opening.value = "";
  openingError.value = null;
  confirmDelete.value = false;
});

// Investments are usually tracked, not budgeted.
watch(type, (next) => {
  if (!editing.value) onBudget.value = next !== "investment";
});

async function save() {
  openingError.value = null;
  const openingMinor = opening.value.trim() ? parse(opening.value, currency.value) : 0;
  if (openingMinor === null) {
    openingError.value = t("errors.invalidAmount");
    return;
  }
  busy.value = true;
  try {
    if (editing.value) {
      await accounts.update(editing.value.id, {
        name: name.value,
        type: type.value,
        institution: institution.value || null,
      });
    } else {
      const created = await accounts.create({
        name: name.value,
        type: type.value,
        currency: currency.value as Account["currency"],
        institution: institution.value || null,
        on_budget: onBudget.value,
      });
      if (openingMinor !== 0) {
        await api("POST", "/transactions", {
          body: {
            account_id: created.id,
            date: todayIso(),
            amount_minor: openingMinor,
            payee: t("accounts.openingPayee"),
            category_id: onBudget.value ? (catalog.income?.id ?? null) : null,
            cleared: "cleared",
            source: "manual",
          },
        });
        await accounts.load();
      }
    }
    ui.changed();
    open.value = false;
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function toggleClosed() {
  if (!editing.value) return;
  busy.value = true;
  try {
    await accounts.update(editing.value.id, {
      closed_at: editing.value.closed_at ? null : new Date().toISOString(),
    });
    ui.changed();
    open.value = false;
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
    await accounts.remove(editing.value.id);
    ui.changed();
    open.value = false;
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UiDialog
    v-model:open="open"
    :title="editing ? t('accounts.editTitle') : t('accounts.newTitle')"
    :width="500"
  >
    <form id="account-form" class="form-grid" @submit.prevent="save">
      <FormField v-slot="{ id }" class="span-2" :label="t('accounts.name')">
        <input :id="id" v-model="name" class="input" required maxlength="200" />
      </FormField>
      <FormField v-slot="{ id }" :label="t('accounts.type')">
        <select :id="id" v-model="type" class="input">
          <option v-for="ty in TYPES" :key="ty" :value="ty">{{ t(`accounts.types.${ty}`) }}</option>
        </select>
      </FormField>
      <FormField v-slot="{ id }" :label="t('common.currency')">
        <select :id="id" v-model="currency" class="input" :disabled="!!editing">
          <option v-for="c in settings.currencies" :key="c" :value="c">{{ c }}</option>
        </select>
      </FormField>
      <FormField
        v-slot="{ id }"
        class="span-2"
        :label="t('accounts.institution')"
        :hint="t('accounts.institutionHint')"
      >
        <input :id="id" v-model="institution" class="input" maxlength="200" />
      </FormField>
      <template v-if="!editing">
        <FormField
          v-slot="{ id }"
          class="span-2"
          :label="`${t('accounts.openingBalance')} (${currency})`"
          :hint="t('accounts.openingBalanceHint')"
          :error="openingError"
        >
          <input
            :id="id"
            v-model="opening"
            class="input num"
            inputmode="decimal"
            placeholder="0.00"
            :aria-invalid="!!openingError"
          />
        </FormField>
        <div class="span-2 on-budget">
          <label class="checkbox"
            ><input v-model="onBudget" type="checkbox" />{{ t("accounts.onBudget") }}</label
          >
          <p class="faint">{{ t("accounts.onBudgetHint") }}</p>
        </div>
      </template>
      <p v-if="confirmDelete" class="span-2 confirm">{{ t("accounts.deleteConfirm") }}</p>
    </form>
    <template #footer>
      <template v-if="editing">
        <UiButton variant="danger" icon="trash" :loading="busy && confirmDelete" @click="remove">{{
          t("common.delete")
        }}</UiButton>
        <UiButton variant="ghost" class="push-left" @click="toggleClosed">
          {{ editing.closed_at ? t("accounts.reopen") : t("accounts.close") }}
        </UiButton>
      </template>
      <UiButton @click="open = false">{{ t("common.cancel") }}</UiButton>
      <UiButton
        type="submit"
        form="account-form"
        variant="primary"
        :loading="busy && !confirmDelete"
      >
        {{ editing ? t("common.save") : t("common.create") }}
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.on-budget {
  display: grid;
  gap: 4px;
}
.on-budget p {
  font-size: var(--text-xs);
  padding-left: 24px;
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
