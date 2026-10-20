<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { IncomingShare, IncomingShareList } from "../../../shared/schemas";
import { api } from "../../api/http";
import { useErrorToast } from "../../composables/errors";
import { PHONE, useMediaQuery } from "../../composables/media";
import { useMoney } from "../../composables/money";
import { formatDate } from "../../composables/month";
import { useToasts } from "../../composables/toasts";
import { useCatalogStore } from "../../stores/catalog";
import { useUiStore } from "../../stores/ui";
import AppIcon from "../ui/AppIcon.vue";
import CategoryDot from "../ui/CategoryDot.vue";
import EmptyState from "../ui/EmptyState.vue";
import UiButton from "../ui/UiButton.vue";
import CategoryOptions from "./CategoryOptions.vue";

/** Entries other people split with you. Only your part counts in your budget. */
const props = defineProps<{ q: string; uncategorized: boolean }>();
const { t, locale } = useI18n();
const { format } = useMoney();
const ui = useUiStore();
const catalog = useCatalogStore();
const showError = useErrorToast();
const { push } = useToasts();
const phone = useMediaQuery(PHONE);

const shares = ref<IncomingShare[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const showDeclined = ref(false);
const busy = ref<string | null>(null);

async function load(more = false) {
  loading.value = true;
  try {
    const list = await api<IncomingShareList>("GET", "/shares", {
      query: {
        status: showDeclined.value ? "declined" : "active",
        uncategorized: props.uncategorized && !showDeclined.value ? "true" : undefined,
        limit: 100,
        cursor: more ? cursor.value : undefined,
      },
    });
    shares.value = more ? [...shares.value, ...list.shares] : list.shares;
    cursor.value = list.next_cursor;
  } catch (e) {
    showError(e);
  } finally {
    loading.value = false;
  }
}
watch([() => props.uncategorized, showDeclined, () => ui.revision], () => load(), {
  immediate: true,
});

const visible = computed(() => {
  const q = props.q.trim().toLowerCase();
  if (!q) return shares.value;
  return shares.value.filter((s) =>
    [s.payee, s.memo, s.owner.name, s.owner.email].some((x) => x.toLowerCase().includes(q)),
  );
});

async function patch(share: IncomingShare, body: { category_id?: string | null; status?: string }) {
  busy.value = share.id;
  try {
    const next = await api<IncomingShare>("PATCH", `/shares/${share.id}`, { body });
    if (body.status) {
      shares.value = shares.value.filter((s) => s.id !== share.id);
      push(t(body.status === "declined" ? "share.declinedToast" : "share.restoredToast"));
    } else {
      Object.assign(share, next);
    }
    ui.changed();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = null;
  }
}

function setCategory(share: IncomingShare, value: string) {
  void patch(share, { category_id: value || null });
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
const dotColor = (share: IncomingShare) =>
  share.category_id === catalog.income?.id ? "slate" : share.category_color;
const methodLabel = (share: IncomingShare) =>
  share.split_method === "percent" && share.percent_bp !== null
    ? `${share.percent_bp / 100} %`
    : t(`share.methodLabel.${share.split_method}`);
</script>

<template>
  <div class="incoming">
    <div class="incoming__bar">
      <p class="lede">{{ t("share.incomingLede") }}</p>
      <label class="checkbox">
        <input v-model="showDeclined" type="checkbox" />{{ t("share.showDeclined") }}
      </label>
    </div>

    <ul v-if="visible.length" class="list" :class="{ 'list--phone': phone }">
      <li
        v-for="s in visible"
        :key="s.id"
        class="item"
        :class="{ 'item--declined': s.status === 'declined', 'item--busy': busy === s.id }"
      >
        <span class="avatar" :title="s.owner.email">{{
          initials(s.owner.name || s.owner.email)
        }}</span>

        <div class="item__main">
          <div class="item__title">
            <strong>{{ s.payee || "—" }}</strong>
            <span v-if="s.memo" class="memo">{{ s.memo }}</span>
          </div>
          <div class="item__meta">
            {{
              t("share.fromOn", {
                name: s.owner.name || s.owner.email,
                date: formatDate(s.date, locale),
              })
            }}
            · {{ methodLabel(s) }}
            ·
            {{ t("share.ofTotal", { amount: format(s.total_minor, s.currency, { code: true }) }) }}
          </div>
        </div>

        <div class="item__category">
          <span v-if="s.status === 'declined'" class="tag tag--muted">{{
            t("share.declined")
          }}</span>
          <label v-else class="picker" :class="{ 'picker--empty': !s.category_id }">
            <CategoryDot v-if="s.category_id" :color="dotColor(s)" />
            <select
              class="picker__select"
              :value="s.category_id ?? ''"
              :aria-label="t('transactions.category')"
              :disabled="busy === s.id"
              @change="setCategory(s, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t("share.chooseCategory") }}</option>
              <CategoryOptions :repayment="false" />
            </select>
            <AppIcon name="chevron-down" :size="14" :stroke-width="2" />
          </label>
        </div>

        <div class="item__amount">
          <span class="num" :class="{ inflow: s.amount_minor > 0 }">{{
            format(s.amount_minor, s.currency, { signed: true })
          }}</span>
          <small>{{ t("share.yourPart") }}</small>
        </div>

        <div class="item__action">
          <UiButton
            v-if="s.status === 'active'"
            size="sm"
            variant="ghost"
            :disabled="busy === s.id"
            @click="patch(s, { status: 'declined' })"
            >{{ t("share.decline") }}</UiButton
          >
          <UiButton
            v-else
            size="sm"
            :disabled="busy === s.id"
            @click="patch(s, { status: 'active' })"
            >{{ t("share.restore") }}</UiButton
          >
        </div>
      </li>
    </ul>

    <EmptyState
      v-else-if="!loading"
      icon="inbox"
      :title="
        showDeclined
          ? t('share.emptyDeclined')
          : uncategorized
            ? t('share.emptyUncategorized')
            : t('share.emptyTitle')
      "
      :body="showDeclined || uncategorized ? undefined : t('share.emptyBody')"
    />

    <div v-if="cursor" class="more">
      <UiButton :loading="loading" @click="load(true)">{{ t("transactions.loadMore") }}</UiButton>
    </div>
  </div>
</template>

<style scoped>
.incoming__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-6);
  margin-bottom: var(--space-4);
}
.lede {
  font-size: var(--text-sm);
  color: var(--text-muted);
  max-width: 60ch;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--border);
}
.item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 220px 120px 96px;
  align-items: center;
  gap: var(--space-4);
  min-height: 64px;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
  transition: opacity var(--duration-base) var(--ease-out);
}
.item--busy {
  opacity: 0.6;
}
.avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.item__main {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.item__title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
  white-space: nowrap;
}
.item__title strong {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}
.memo {
  font-size: var(--text-sm);
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
}
.item__meta {
  font-size: var(--text-xs);
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 32px;
  padding: 0 var(--space-2) 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  font-size: var(--text-sm);
  color: var(--text-muted);
  cursor: pointer;
}
.picker:hover {
  border-color: var(--border-strong);
}
.picker:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}
.picker--empty {
  border-color: transparent;
  background: var(--caution-soft);
  color: var(--caution);
  font-weight: 600;
}
.picker__select {
  flex: 1;
  min-width: 0;
  appearance: none;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  outline: none;
  text-overflow: ellipsis;
}
.picker :deep(.app-icon) {
  color: var(--text-faint);
  pointer-events: none;
}
.picker--empty :deep(.app-icon) {
  color: inherit;
}
.tag {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.tag--muted {
  background: var(--surface-sunken);
  color: var(--text-faint);
}
.item__amount {
  display: grid;
  justify-items: end;
}
.item__amount .num {
  font-weight: 600;
}
.item__amount small {
  font-size: var(--text-xs);
  color: var(--text-faint);
}
.item--declined .item__amount .num {
  text-decoration: line-through;
  color: var(--text-faint);
  font-weight: 400;
}
.item__action {
  display: flex;
  justify-content: flex-end;
}
.inflow {
  color: var(--positive);
}
.more {
  display: flex;
  justify-content: center;
  margin-top: var(--space-6);
}

/* Phone: avatar + text on top, category and amount below. */
.list--phone .item {
  grid-template-columns: 32px minmax(0, 1fr) auto;
  grid-template-areas:
    "avatar main amount"
    ". category action";
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) 0;
}
.list--phone .avatar {
  grid-area: avatar;
  align-self: start;
}
.list--phone .item__main {
  grid-area: main;
}
.list--phone .item__amount {
  grid-area: amount;
  align-self: start;
}
.list--phone .item__category {
  grid-area: category;
  min-width: 0;
}
.list--phone .item__action {
  grid-area: action;
}
</style>
