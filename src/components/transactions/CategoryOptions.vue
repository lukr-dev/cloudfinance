<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useCatalogStore } from "../../stores/catalog";

/** The <option>s of every category select: system categories first, then groups. */
withDefaults(defineProps<{ repayment?: boolean }>(), { repayment: true });
const { t } = useI18n();
const catalog = useCatalogStore();
</script>

<template>
  <option v-if="catalog.income" :value="catalog.income.id">
    {{ t("transactions.readyToAssign") }}
  </option>
  <option v-if="repayment && catalog.repayment" :value="catalog.repayment.id">
    {{ t("transactions.sharedRepayment") }}
  </option>
  <optgroup v-for="entry in catalog.grouped" :key="entry.group.id" :label="entry.group.name">
    <option v-for="c in entry.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
  </optgroup>
</template>
