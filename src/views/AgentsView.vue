<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { AuditEvent, AuditList } from "../../shared/schemas";
import { auth } from "../api/auth";
import { api } from "../api/http";
import PageLayout from "../components/layout/PageLayout.vue";
import AppIcon from "../components/ui/AppIcon.vue";
import FormField from "../components/ui/FormField.vue";
import UiButton from "../components/ui/UiButton.vue";
import UiDialog from "../components/ui/UiDialog.vue";
import { useErrorToast } from "../composables/errors";
import { formatDateTime, relativeTime } from "../composables/time";
import { useToasts } from "../composables/toasts";

interface KeyRow {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string | Date;
  lastRequest: string | Date | null;
}

const { t, locale } = useI18n();
const { push } = useToasts();
const showError = useErrorToast();

const keys = ref<KeyRow[]>([]);
const events = ref<AuditEvent[]>([]);
const eventsCursor = ref<string | null>(null);
const origin = location.origin;
const mcpUrl = `${origin}/mcp`;

const createOpen = ref(false);
const keyName = ref("");
const createdKey = ref<string | null>(null);
const busy = ref(false);
const revokeId = ref<string | null>(null);

// The plaintext key lives only as long as the dialog that reveals it.
watch(createOpen, (isOpen) => {
  if (!isOpen) createdKey.value = null;
});

const keyNames = computed(() => new Map(keys.value.map((k) => [k.id, k.name ?? k.start ?? k.id])));
const claudeCommand = computed(
  () =>
    `claude mcp add --transport http cloudfinance ${mcpUrl} --header "Authorization: Bearer ${createdKey.value ?? "<api-key>"}"`,
);

async function loadKeys() {
  const { data, error } = await auth.apiKey.list();
  if (error) throw new Error(error.message);
  const list = (Array.isArray(data) ? data : (data as { apiKeys: KeyRow[] }).apiKeys) as KeyRow[];
  keys.value = [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function loadEvents(more = false) {
  const list = await api<AuditList>("GET", "/audit-events", {
    query: { limit: 25, cursor: more ? eventsCursor.value : undefined },
  });
  events.value = more ? [...events.value, ...list.events] : list.events;
  eventsCursor.value = list.next_cursor;
}

onMounted(async () => {
  try {
    await Promise.all([loadKeys(), loadEvents()]);
  } catch (e) {
    showError(e);
  }
});

function startCreate() {
  keyName.value = "";
  createdKey.value = null;
  createOpen.value = true;
}

async function create() {
  busy.value = true;
  const { data, error } = await auth.apiKey.create({ name: keyName.value.trim() });
  busy.value = false;
  if (error || !data) {
    push(error?.message ?? t("errors.generic"), "error");
    return;
  }
  createdKey.value = data.key;
  await loadKeys();
}

async function revoke(id: string) {
  if (revokeId.value !== id) {
    revokeId.value = id;
    return;
  }
  const { error } = await auth.apiKey.delete({ keyId: id });
  revokeId.value = null;
  if (error) {
    push(error.message ?? t("errors.generic"), "error");
    return;
  }
  push(t("agents.revoked"));
  await loadKeys();
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  push(t("common.copied"));
}

function actorLabel(event: AuditEvent) {
  if (event.actor_type === "user") return t("agents.actor.user");
  return keyNames.value.get(event.actor_id) ?? t("agents.actor.api_key");
}

function when(value: string | Date | null) {
  return value ? relativeTime(new Date(value).toISOString(), locale.value) : t("agents.never");
}
</script>

<template>
  <PageLayout :title="t('agents.title')">
    <p class="lede">{{ t("agents.lede") }}</p>

    <div class="endpoints">
      <section class="card">
        <header>
          <span class="card__icon"><AppIcon name="agents" /></span>
          <h2>{{ t("agents.mcp") }}</h2>
        </header>
        <p class="muted">{{ t("agents.mcpLede") }}</p>
        <div class="copy-row">
          <code>{{ mcpUrl }}</code>
          <UiButton size="sm" icon="copy" @click="copy(mcpUrl)">{{ t("common.copy") }}</UiButton>
        </div>
        <p class="eyebrow small-gap">Claude Code</p>
        <div class="copy-row copy-row--block">
          <code>{{ claudeCommand }}</code>
          <UiButton size="sm" icon="copy" @click="copy(claudeCommand)">{{
            t("common.copy")
          }}</UiButton>
        </div>
      </section>
      <section class="card">
        <header>
          <span class="card__icon"><AppIcon name="external" /></span>
          <h2>{{ t("agents.rest") }}</h2>
        </header>
        <p class="muted">{{ t("agents.restLede") }}</p>
        <div class="copy-row">
          <code>{{ origin }}/api/v1</code>
          <UiButton size="sm" icon="copy" @click="copy(`${origin}/api/v1`)">{{
            t("common.copy")
          }}</UiButton>
        </div>
        <a class="link" :href="`${origin}/api/v1/openapi.json`" target="_blank" rel="noopener"
          >{{ t("agents.openapi") }} ↗</a
        >
      </section>
    </div>

    <hr class="section-rule" />

    <div class="section-head">
      <h2>{{ t("agents.keys") }}</h2>
      <UiButton variant="primary" icon="key" @click="startCreate">{{
        t("agents.createKey")
      }}</UiButton>
    </div>
    <p v-if="!keys.length" class="muted">{{ t("agents.noKeys") }}</p>
    <table v-else class="data-table keys">
      <thead>
        <tr>
          <th class="left">{{ t("common.name") }}</th>
          <th class="left">Key</th>
          <th class="left">{{ t("agents.created") }}</th>
          <th class="left">{{ t("agents.lastUsed") }}</th>
          <th>
            <span class="sr-only">{{ t("common.actions") }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="k in keys" :key="k.id">
          <td class="left strong">{{ k.name || "—" }}</td>
          <td class="left">
            <code class="key-start">{{ k.start ?? "cf_" }}…</code>
          </td>
          <td class="left muted">
            {{ formatDateTime(new Date(k.createdAt).toISOString(), locale) }}
          </td>
          <td class="left muted">{{ when(k.lastRequest) }}</td>
          <td>
            <UiButton
              size="sm"
              :variant="revokeId === k.id ? 'danger' : 'ghost'"
              @click="revoke(k.id)"
            >
              {{ revokeId === k.id ? t("agents.revokeAgain") : t("agents.revoke") }}
            </UiButton>
          </td>
        </tr>
      </tbody>
    </table>

    <hr class="section-rule" />

    <div class="section-head">
      <div>
        <h2>{{ t("agents.activity") }}</h2>
        <p class="muted small">{{ t("agents.activityLede") }}</p>
      </div>
    </div>
    <p v-if="!events.length" class="muted">{{ t("agents.noActivity") }}</p>
    <ol v-else class="timeline">
      <li v-for="e in events" :key="e.id">
        <span class="actor" :class="`actor--${e.actor_type}`">
          <AppIcon
            :name="e.actor_type === 'api_key' ? 'agents' : 'check'"
            :size="12"
            :stroke-width="2.2"
          />
          {{ actorLabel(e) }}
        </span>
        <span class="what"
          ><strong>{{ e.action }}</strong> {{ e.entity.replace(/_/g, " ") }}</span
        >
        <time class="faint" :datetime="e.at" :title="formatDateTime(e.at, locale)">{{
          relativeTime(e.at, locale)
        }}</time>
      </li>
    </ol>
    <div v-if="eventsCursor" class="more">
      <UiButton size="sm" @click="loadEvents(true)">{{ t("transactions.loadMore") }}</UiButton>
    </div>

    <UiDialog v-model:open="createOpen" :title="t('agents.createKey')" :width="520">
      <form v-if="!createdKey" id="key-form" @submit.prevent="create">
        <FormField v-slot="{ id }" :label="t('agents.keyName')" :hint="t('agents.keyNameHint')">
          <input :id="id" v-model="keyName" class="input" required maxlength="64" />
        </FormField>
      </form>
      <template v-else>
        <p class="warn">{{ t("agents.keyCreated") }}</p>
        <div class="copy-row copy-row--block">
          <code>{{ createdKey }}</code>
          <UiButton size="sm" icon="copy" @click="copy(createdKey)">{{
            t("common.copy")
          }}</UiButton>
        </div>
        <p class="eyebrow small-gap">Claude Code</p>
        <div class="copy-row copy-row--block">
          <code>{{ claudeCommand }}</code>
          <UiButton size="sm" icon="copy" @click="copy(claudeCommand)">{{
            t("common.copy")
          }}</UiButton>
        </div>
      </template>
      <template #footer>
        <template v-if="!createdKey">
          <UiButton @click="createOpen = false">{{ t("common.cancel") }}</UiButton>
          <UiButton type="submit" form="key-form" variant="primary" :loading="busy">{{
            t("common.create")
          }}</UiButton>
        </template>
        <UiButton v-else variant="primary" @click="createOpen = false">{{
          t("common.close")
        }}</UiButton>
      </template>
    </UiDialog>
  </PageLayout>
</template>

<style scoped>
.lede {
  max-width: 64ch;
  color: var(--text-muted);
  margin-bottom: var(--space-6);
}
.endpoints {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-4);
}
.card {
  display: grid;
  gap: var(--space-3);
  align-content: start;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
}
.card header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.card h2 {
  font-size: var(--text-lg);
  font-weight: 600;
}
.card p {
  font-size: 0.875rem;
}
.card__icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
}
.copy-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 6px 6px var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
}
.copy-row code {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-row--block code {
  white-space: pre-wrap;
  word-break: break-all;
}
.small-gap {
  margin-top: var(--space-2);
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-4);
}
.section-head h2 {
  font-size: var(--text-lg);
  font-weight: 600;
}
.small {
  font-size: var(--text-sm);
}
.keys td {
  height: 52px;
  font-size: 0.875rem;
}
.strong {
  font-weight: 500;
}
.key-start {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}
.timeline li {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.875rem;
}
.actor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  padding: 2px 10px 2px 6px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actor--api_key {
  background: var(--accent-soft);
  color: var(--accent);
}
.actor--user {
  background: var(--surface-active);
  color: var(--text-muted);
}
.what {
  color: var(--text-muted);
}
.what strong {
  color: var(--text);
  font-weight: 600;
}
.more {
  display: flex;
  justify-content: center;
  margin-top: var(--space-4);
}
.warn {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--caution-soft);
  color: var(--caution);
  font-size: 0.875rem;
  font-weight: 500;
}
@media (max-width: 760px) {
  .timeline li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .what {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
