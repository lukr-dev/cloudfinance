<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { colors } from "../../../shared/schemas";
import { useErrorToast } from "../../composables/errors";
import { useCatalogStore } from "../../stores/catalog";
import { useUiStore } from "../../stores/ui";
import FormField from "../ui/FormField.vue";
import UiButton from "../ui/UiButton.vue";
import UiDialog from "../ui/UiDialog.vue";

/** Create or edit a category. `categoryId` null → create in `groupId`. */
const props = defineProps<{ categoryId: string | null; groupId: string | null }>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const catalog = useCatalogStore();
const ui = useUiStore();
const showError = useErrorToast();

const name = ref("");
const group = ref("");
const color = ref<(typeof colors)[number] | undefined>(undefined);
const note = ref("");
const hidden = ref(false);
const reassignTo = ref("");
const confirmDelete = ref(false);
const busy = ref(false);

const existing = computed(() =>
  props.categoryId ? (catalog.byId.get(props.categoryId) ?? null) : null,
);
const others = computed(() =>
  catalog.categories.filter((c) => c.kind === "expense" && c.id !== props.categoryId),
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  const c = existing.value;
  name.value = c?.name ?? "";
  group.value = c?.group_id ?? props.groupId ?? catalog.groups[0]?.id ?? "";
  color.value = c?.color;
  note.value = c?.note ?? "";
  hidden.value = c?.hidden ?? false;
  reassignTo.value = "";
  confirmDelete.value = false;
});

async function save() {
  busy.value = true;
  try {
    if (existing.value) {
      await catalog.updateCategory(existing.value.id, {
        name: name.value,
        group_id: group.value,
        color: color.value,
        note: note.value,
        hidden: hidden.value,
      });
    } else {
      await catalog.createCategory({
        name: name.value,
        group_id: group.value,
        color: color.value,
        note: note.value || undefined,
      });
    }
    ui.changed();
    open.value = false;
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!existing.value) return;
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  busy.value = true;
  try {
    await catalog.removeCategory(existing.value.id, reassignTo.value || undefined);
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
    :title="existing ? t('category.editTitle') : t('category.newTitle')"
  >
    <form id="category-form" class="grid" @submit.prevent="save">
      <FormField v-slot="{ id }" :label="t('common.name')">
        <input :id="id" v-model="name" class="input" required maxlength="200" />
      </FormField>
      <FormField v-slot="{ id }" :label="t('category.group')">
        <select :id="id" v-model="group" class="input" required>
          <option v-for="g in catalog.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </FormField>
      <div class="field">
        <span class="label">{{ t("category.color") }}</span>
        <div class="swatches" role="radiogroup" :aria-label="t('category.color')">
          <button
            v-for="c in colors"
            :key="c"
            type="button"
            role="radio"
            class="swatch"
            :aria-checked="color === c"
            :aria-label="c"
            :style="{ background: `var(--cat-${c})` }"
            @click="color = c"
          />
        </div>
      </div>
      <FormField v-slot="{ id }" :label="t('category.note')">
        <textarea :id="id" v-model="note" class="input" rows="2" />
      </FormField>
      <label v-if="existing" class="checkbox"
        ><input v-model="hidden" type="checkbox" />{{ t("category.hidden") }}</label
      >

      <div v-if="confirmDelete" class="danger-zone">
        <p>{{ t("category.deleteConfirm") }}</p>
        <FormField v-slot="{ id }" :label="t('category.reassignTo')">
          <select :id="id" v-model="reassignTo" class="input">
            <option value="">{{ t("common.none") }}</option>
            <option v-for="c in others" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </FormField>
      </div>
    </form>
    <template #footer>
      <UiButton
        v-if="existing"
        variant="danger"
        class="push-left"
        :loading="busy && confirmDelete"
        @click="remove"
      >
        {{ t("common.delete") }}
      </UiButton>
      <UiButton @click="open = false">{{ t("common.cancel") }}</UiButton>
      <UiButton
        type="submit"
        form="category-form"
        variant="primary"
        :loading="busy && !confirmDelete"
      >
        {{ existing ? t("common.save") : t("common.create") }}
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.grid {
  display: grid;
  gap: var(--space-4);
}
.field {
  display: grid;
  gap: 6px;
}
.label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-muted);
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--surface-raised);
  box-shadow: 0 0 0 1px var(--border);
  cursor: pointer;
}
.swatch[aria-checked="true"] {
  box-shadow: 0 0 0 2px var(--text);
}
.danger-zone {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--negative-soft);
  color: var(--negative);
  font-size: 0.875rem;
}
.push-left {
  margin-right: auto;
}
</style>
