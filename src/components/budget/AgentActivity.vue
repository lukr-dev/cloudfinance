<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { AuditEvent, AuditList } from "../../../shared/schemas";
import { api } from "../../api/http";
import { relativeTime } from "../../composables/time";
import { useUiStore } from "../../stores/ui";

/** Status-bar line: the most recent write made by an agent (API key). */
const { t, locale } = useI18n();
const ui = useUiStore();
const latest = ref<AuditEvent | null>(null);

async function load() {
  try {
    const list = await api<AuditList>("GET", "/audit-events", { query: { limit: 20 } });
    latest.value = list.events.find((e) => e.actor_type === "api_key") ?? null;
  } catch {
    latest.value = null;
  }
}
onMounted(load);
watch(() => ui.revision, load);
</script>

<template>
  <RouterLink v-if="latest" to="/agents" class="activity">
    {{
      t("agents.lastWrite", {
        action: latest.action,
        entity: latest.entity,
        when: relativeTime(latest.at, locale),
      })
    }}
  </RouterLink>
</template>

<style scoped>
.activity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  text-decoration: none;
}
.activity::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
.activity:hover {
  color: var(--text);
}
</style>
