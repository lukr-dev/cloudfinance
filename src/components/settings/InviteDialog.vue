<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { InvitationCreated } from "../../../shared/schemas";
import { api } from "../../api/http";
import { useErrorToast } from "../../composables/errors";
import { formatDateTime } from "../../composables/time";
import AppIcon from "../ui/AppIcon.vue";
import FormField from "../ui/FormField.vue";
import UiButton from "../ui/UiButton.vue";
import UiDialog from "../ui/UiDialog.vue";

/** Create a one-time invite link. The link is shown here once and never again. */
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ created: [] }>();
const { t, locale } = useI18n();
const showError = useErrorToast();

const email = ref("");
const busy = ref(false);
const created = ref<InvitationCreated | null>(null);
const copied = ref(false);
const link = computed(() =>
  created.value ? new URL(created.value.url, location.origin).href : "",
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  email.value = "";
  created.value = null;
  copied.value = false;
});

async function create() {
  busy.value = true;
  try {
    created.value = await api<InvitationCreated>("POST", "/invitations", {
      body: email.value.trim() ? { email: email.value.trim() } : {},
    });
    emit("created");
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function copy() {
  await navigator.clipboard.writeText(link.value);
  copied.value = true;
}
</script>

<template>
  <UiDialog v-model:open="open" :title="t('members.inviteTitle')" :width="480">
    <form v-if="!created" id="invite-form" class="form" @submit.prevent="create">
      <p class="lede">{{ t("members.inviteLede") }}</p>
      <FormField
        v-slot="{ id }"
        :label="`${t('common.email')} (${t('common.optional')})`"
        :hint="t('members.inviteEmailHint')"
      >
        <input
          :id="id"
          v-model="email"
          class="input"
          type="email"
          autocomplete="off"
          spellcheck="false"
        />
      </FormField>
    </form>

    <div v-else class="form">
      <div class="done">
        <span class="done__icon"><AppIcon name="link" :size="18" :stroke-width="2" /></span>
        <div>
          <strong>{{ t("members.linkReady") }}</strong>
          <p>
            {{
              t("members.linkOnce", { date: formatDateTime(created.invitation.expires_at, locale) })
            }}
          </p>
        </div>
      </div>
      <div class="link">
        <input
          class="input link__url"
          readonly
          :value="link"
          :aria-label="t('members.link')"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <UiButton :icon="copied ? 'check' : 'copy'" @click="copy">{{
          copied ? t("common.copied") : t("common.copy")
        }}</UiButton>
      </div>
      <p v-if="created.invitation.email" class="faint">
        {{ t("members.boundTo", { email: created.invitation.email }) }}
      </p>
    </div>

    <template #footer>
      <template v-if="!created">
        <UiButton @click="open = false">{{ t("common.cancel") }}</UiButton>
        <UiButton type="submit" form="invite-form" variant="primary" icon="link" :loading="busy">{{
          t("members.createLink")
        }}</UiButton>
      </template>
      <UiButton v-else variant="primary" @click="open = false">{{ t("common.done") }}</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--space-4);
}
.lede {
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.done {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}
.done__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}
.done strong {
  font-weight: 600;
}
.done p {
  margin-top: 2px;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.link {
  display: flex;
  gap: var(--space-2);
}
.link__url {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
.faint {
  font-size: var(--text-xs);
  color: var(--text-faint);
}
</style>
