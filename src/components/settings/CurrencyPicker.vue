<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ALL_CURRENCIES,
  COMMON_CURRENCIES,
  currencyName,
  type CurrencyCode,
} from "../../composables/currencies";
import AppIcon from "../ui/AppIcon.vue";
import UiDialog from "../ui/UiDialog.vue";

const props = defineProps<{ enabled: string[] }>();
const emit = defineEmits<{ pick: [code: CurrencyCode] }>();
const open = defineModel<boolean>("open", { required: true });

const { t, locale } = useI18n();
const query = ref("");
const active = ref(0);
const searchInput = ref<HTMLInputElement>();
const list = ref<HTMLElement>();

watch(open, async (isOpen) => {
  if (!isOpen) return;
  query.value = "";
  active.value = 0;
  await nextTick();
  searchInput.value?.focus();
});

interface Row {
  code: CurrencyCode;
  name: string;
}

const rows = computed<Row[]>(() =>
  ALL_CURRENCIES.filter((code) => !props.enabled.includes(code)).map((code) => ({
    code,
    name: currencyName(code, locale.value),
  })),
);

/** Without a query: common currencies first, then everything else by code. */
const sections = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q) {
    const matches = rows.value
      .filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(!a.code.toLowerCase().startsWith(q)) - Number(!b.code.toLowerCase().startsWith(q)),
      );
    return [{ key: "results", title: "", rows: matches }];
  }
  const common = new Set<string>(COMMON_CURRENCIES);
  return [
    {
      key: "common",
      title: t("settings.commonCurrencies"),
      rows: rows.value.filter((r) => common.has(r.code)),
    },
    {
      key: "all",
      title: t("settings.allCurrencies"),
      rows: rows.value.filter((r) => !common.has(r.code)),
    },
  ].filter((s) => s.rows.length);
});

const flat = computed(() => sections.value.flatMap((s) => s.rows));
watch(query, () => (active.value = 0));

function move(delta: number) {
  if (!flat.value.length) return;
  active.value = (active.value + delta + flat.value.length) % flat.value.length;
  void nextTick(() =>
    list.value
      ?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)
      ?.scrollIntoView({ block: "nearest" }),
  );
}

function choose(code: CurrencyCode) {
  emit("pick", code);
  open.value = false;
}

function chooseActive() {
  const row = flat.value[active.value];
  if (row) choose(row.code);
}

const indexOf = (code: string) => flat.value.findIndex((r) => r.code === code);
</script>

<template>
  <UiDialog v-model:open="open" :title="t('settings.addCurrency')" :width="460">
    <label class="search">
      <AppIcon name="search" :size="16" />
      <input
        ref="searchInput"
        v-model="query"
        class="input"
        type="search"
        :placeholder="t('settings.searchCurrency')"
        role="combobox"
        aria-controls="currency-options"
        :aria-activedescendant="flat[active] ? `currency-${flat[active]!.code}` : undefined"
        aria-expanded="true"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="chooseActive"
      />
    </label>

    <div
      id="currency-options"
      ref="list"
      class="options"
      role="listbox"
      :aria-label="t('settings.addCurrency')"
    >
      <template v-for="section in sections" :key="section.key">
        <p v-if="section.title" class="label picker-group">{{ section.title }}</p>
        <button
          v-for="row in section.rows"
          :id="`currency-${row.code}`"
          :key="row.code"
          type="button"
          role="option"
          class="option"
          :class="{ 'is-active': indexOf(row.code) === active }"
          :aria-selected="indexOf(row.code) === active"
          :data-index="indexOf(row.code)"
          @mousemove="active = indexOf(row.code)"
          @click="choose(row.code)"
        >
          <span class="code">{{ row.code }}</span>
          <span class="name">{{ row.name }}</span>
          <AppIcon name="plus" :size="14" :stroke-width="2" class="add" />
        </button>
      </template>
      <p v-if="!flat.length" class="empty">{{ t("settings.noCurrencyMatch") }}</p>
    </div>
  </UiDialog>
</template>

<style scoped>
.search {
  position: relative;
  color: var(--text-faint);
}
.search :deep(svg) {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
}
.search .input {
  padding-left: 36px;
}
.options {
  max-height: min(420px, 60vh);
  overflow-y: auto;
  margin: 0 calc(-1 * var(--space-3));
  padding: 0 var(--space-1);
}
.picker-group {
  padding: var(--space-3) var(--space-3) var(--space-1);
}
.option {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  height: 40px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: 0.875rem;
}
.option.is-active {
  background: var(--surface-hover);
}
.code {
  font-weight: 600;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.name {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.add {
  color: var(--text-faint);
  opacity: 0;
}
.option.is-active .add {
  opacity: 1;
  color: var(--accent);
}
.empty {
  padding: var(--space-6) var(--space-3);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
}
</style>
