import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  Category,
  CategoryCreate,
  CategoryGroup,
  CategoryUpdate,
  GroupCreate,
  GroupUpdate,
  StarterResult,
} from "../../shared/schemas";
import { api } from "../api/http";

/** Category groups and categories (including the income system category). */
export const useCatalogStore = defineStore("catalog", () => {
  const groups = ref<CategoryGroup[]>([]);
  const categories = ref<Category[]>([]);

  async function load() {
    const [g, c] = await Promise.all([
      api<CategoryGroup[]>("GET", "/category-groups"),
      api<Category[]>("GET", "/categories"),
    ]);
    groups.value = g;
    categories.value = c;
  }

  const income = computed(() => categories.value.find((c) => c.kind === "income") ?? null);
  const byId = computed(() => new Map(categories.value.map((c) => [c.id, c])));

  /** Expense categories grouped and sorted for selects. */
  const grouped = computed(() =>
    [...groups.value]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((group) => ({
        group,
        categories: categories.value
          .filter((c) => c.group_id === group.id && c.kind === "expense")
          .sort((a, b) => a.sort_order - b.sort_order),
      })),
  );

  async function createGroup(input: GroupCreate) {
    const group = await api<CategoryGroup>("POST", "/category-groups", { body: input });
    await load();
    return group;
  }
  async function updateGroup(id: string, patch: GroupUpdate) {
    await api("PATCH", `/category-groups/${id}`, { body: patch });
    await load();
  }
  async function removeGroup(id: string) {
    await api("DELETE", `/category-groups/${id}`);
    await load();
  }
  async function createCategory(input: CategoryCreate) {
    const category = await api<Category>("POST", "/categories", { body: input });
    await load();
    return category;
  }
  async function updateCategory(id: string, patch: CategoryUpdate) {
    await api("PATCH", `/categories/${id}`, { body: patch });
    await load();
  }
  async function removeCategory(id: string, reassignTo?: string) {
    await api("DELETE", `/categories/${id}`, { query: { reassign_to: reassignTo } });
    await load();
  }
  async function addStarterSet() {
    await api<StarterResult>("POST", "/setup/starter-categories", { body: {} });
    await load();
  }

  return {
    groups,
    categories,
    income,
    byId,
    grouped,
    load,
    createGroup,
    updateGroup,
    removeGroup,
    createCategory,
    updateCategory,
    removeCategory,
    addStarterSet,
  };
});
