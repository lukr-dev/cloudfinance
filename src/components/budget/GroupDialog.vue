<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useErrorToast } from "../../composables/errors";
import { useCatalogStore } from "../../stores/catalog";
import { useUiStore } from "../../stores/ui";
import FormField from "../ui/FormField.vue";
import UiButton from "../ui/UiButton.vue";
import UiDialog from "../ui/UiDialog.vue";

const props = defineProps<{ groupId: string | null }>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const catalog = useCatalogStore();
const ui = useUiStore();
const showError = useErrorToast();
const name = ref("");
const hidden = ref(false);
const busy = ref(false);
const existing = computed(() => catalog.groups.find((g) => g.id === props.groupId) ?? null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  name.value = existing.value?.name ?? "";
  hidden.value = existing.value?.hidden ?? false;
});

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  try {
    await action();
    ui.changed();
    open.value = false;
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

const save = () =>
  run(() =>
    existing.value
      ? catalog.updateGroup(existing.value.id, { name: name.value, hidden: hidden.value })
      : catalog.createGroup({ name: name.value, sort_order: catalog.groups.length }),
  );
const remove = () => run(() => catalog.removeGroup(existing.value!.id));
</script>

<template>
  <UiDialog
    v-model:open="open"
    :title="existing ? t('category.editGroupTitle') : t('category.newGroupTitle')"
    :width="400"
  >
    <form id="group-form" class="grid" @submit.prevent="save">
      <FormField v-slot="{ id }" :label="t('common.name')">
        <input :id="id" v-model="name" class="input" required maxlength="200" />
      </FormField>
      <label v-if="existing" class="checkbox"
        ><input v-model="hidden" type="checkbox" />{{ t("category.hidden") }}</label
      >
    </form>
    <template #footer>
      <UiButton v-if="existing" variant="danger" class="push-left" @click="remove">{{
        t("category.deleteGroup")
      }}</UiButton>
      <UiButton @click="open = false">{{ t("common.cancel") }}</UiButton>
      <UiButton type="submit" form="group-form" variant="primary" :loading="busy">
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
.push-left {
  margin-right: auto;
}
</style>
