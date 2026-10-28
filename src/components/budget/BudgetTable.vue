<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { BudgetMonth } from "../../../shared/schemas";
import { PHONE, useMediaQuery } from "../../composables/media";
import { useMoney } from "../../composables/money";
import AppIcon from "../ui/AppIcon.vue";
import AvailablePill from "../ui/AvailablePill.vue";
import CategoryDot from "../ui/CategoryDot.vue";
import IconButton from "../ui/IconButton.vue";
import AssignInput from "./AssignInput.vue";

defineProps<{ data: BudgetMonth; selectedId: string | null }>();
const emit = defineEmits<{
  select: [categoryId: string];
  assign: [categoryId: string, amountMinor: number];
  addCategory: [groupId: string];
  editGroup: [groupId: string];
}>();

const { t } = useI18n();
const { format } = useMoney();
// Phones drop the Activity column; group rows show the name and actions full width.
const phone = useMediaQuery(PHONE);

const STORAGE_KEY = "cf.collapsedGroups";
const collapsed = ref(new Set<string>(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")));
watch(collapsed, (set) => localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])), {
  deep: true,
});

function toggle(groupId: string) {
  const next = new Set(collapsed.value);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  collapsed.value = next;
}
</script>

<template>
  <table class="data-table budget-table">
    <thead>
      <tr>
        <th class="left">{{ t("budget.category") }}</th>
        <th class="col-num">{{ t("budget.assignedCol") }}</th>
        <th v-if="!phone" class="col-num">{{ t("budget.activityCol") }}</th>
        <th class="col-num">{{ t("budget.availableCol") }}</th>
      </tr>
    </thead>
    <tbody v-for="group in data.groups.filter((g) => !g.hidden)" :key="group.id">
      <tr class="group-row">
        <td class="left" :colspan="phone ? 3 : 1">
          <div class="group-name">
            <button
              type="button"
              class="group-toggle"
              :aria-expanded="!collapsed.has(group.id)"
              @click="toggle(group.id)"
            >
              <AppIcon name="chevron-down" :size="16" :stroke-width="2" class="chev" />
              <span class="group-toggle__name">{{ group.name }}</span>
            </button>
            <span class="group-actions">
              <IconButton
                icon="plus"
                :size="14"
                :label="t('budget.addCategory')"
                @click="emit('addCategory', group.id)"
              />
              <IconButton
                icon="edit"
                :size="14"
                :label="t('category.editGroupTitle')"
                @click="emit('editGroup', group.id)"
              />
            </span>
          </div>
        </td>
        <template v-if="!phone">
          <td class="num">{{ format(group.assigned_minor, data.currency) }}</td>
          <td class="num">{{ format(group.activity_minor, data.currency) }}</td>
          <td class="num">{{ format(group.available_minor, data.currency) }}</td>
        </template>
      </tr>
      <template v-if="!collapsed.has(group.id)">
        <tr
          v-for="category in group.categories.filter((c) => !c.hidden)"
          :key="category.id"
          class="cat-row"
          :class="{ 'is-selected': category.id === selectedId }"
          :aria-selected="category.id === selectedId"
          @click="emit('select', category.id)"
        >
          <td class="left">
            <button type="button" class="cat-name" @click.stop="emit('select', category.id)">
              <CategoryDot :color="category.color" />
              <span class="cat-name__text">{{ category.name }}</span>
              <AppIcon
                v-if="category.attachment_count"
                name="paperclip"
                class="clip"
                :size="13"
                :stroke-width="2"
              />
            </button>
          </td>
          <td>
            <AssignInput
              :amount-minor="category.assigned_minor"
              :currency="data.currency"
              :label="t('budget.assignTo', { name: category.name })"
              @commit="(value) => emit('assign', category.id, value)"
            />
          </td>
          <td v-if="!phone" class="num activity">
            {{ format(category.activity_minor, data.currency) }}
          </td>
          <td>
            <AvailablePill :amount-minor="category.available_minor" :currency="data.currency" />
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<style scoped>
.budget-table {
  table-layout: fixed;
}
.col-num {
  width: 150px;
}
/* Align header and group totals with the text inside the Available pills. */
.budget-table th:last-child,
.group-row td:last-child {
  padding-right: 10px;
}
.group-row td {
  height: 42px;
  font-size: var(--text-sm);
  color: var(--text-faint);
}
.group-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.group-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}
.group-toggle__name,
.cat-name__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chev {
  color: var(--text-faint);
  transition: transform var(--duration-base) var(--ease-out);
}
.group-toggle[aria-expanded="false"] .chev {
  transform: rotate(-90deg);
}
.group-actions {
  display: inline-flex;
  flex: none;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.group-actions :deep(.icon-button) {
  width: 28px;
  height: 28px;
}
.group-row:hover .group-actions,
.group-actions:focus-within {
  opacity: 1;
}
/* Touch screens have no hover: keep the group actions visible. */
@media (hover: none) {
  .group-actions {
    opacity: 1;
  }
}
.cat-row {
  cursor: pointer;
}
.cat-row td {
  transition: background var(--duration-fast) var(--ease-out);
}
.cat-row:hover td {
  background: var(--surface-hover);
}
.cat-row.is-selected td {
  background: var(--accent-soft);
}
.cat-name {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  padding: 0 0 0 24px;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: var(--text-md);
}
.clip {
  flex: none;
  margin-left: calc(-1 * var(--space-1));
  color: var(--text-faint);
}
.activity {
  color: var(--text-muted);
}
@media (max-width: 760px) {
  .col-num {
    width: 104px;
  }
  .budget-table th:last-child {
    padding-right: 8px;
  }
  .group-row td:last-child {
    padding-right: 0;
  }
  .budget-table td {
    height: 52px;
  }
  .group-row td {
    height: 44px;
  }
  .group-actions {
    opacity: 1;
    margin-left: auto;
  }
  .budget-table td:not(:first-child),
  .budget-table th:not(:first-child) {
    padding-left: var(--space-2);
    padding-right: 0;
  }
  .cat-name {
    gap: var(--space-2);
    padding-left: 4px;
  }
  .budget-table :deep(.pill) {
    min-width: 0;
    max-width: 100%;
    padding: 0 8px;
  }
}
</style>
