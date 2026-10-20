<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import type { InviteStatus } from "../../shared/schemas";
import { getInviteStatus } from "../api";
import { auth } from "../api/auth";
import { api } from "../api/http";
import AuthLayout from "../components/layout/AuthLayout.vue";
import FormField from "../components/ui/FormField.vue";
import UiButton from "../components/ui/UiButton.vue";
import { useToasts } from "../composables/toasts";
import { useSessionStore } from "../stores/session";

/** Opened from an invite link (/join?token=…): create an account on this instance. */
const { t, locale } = useI18n();
const router = useRouter();
const session = useSessionStore();
const { push } = useToasts();

const queryToken = useRoute().query.token;
const token = typeof queryToken === "string" ? queryToken.trim() : "";
const status = ref<InviteStatus | null>(null);
const step = ref<"loading" | "invalid" | "account" | "passkey">("loading");
const name = ref("");
const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const passwordError = ref<string | null>(null);
const busy = ref(false);

onMounted(async () => {
  if (!token) {
    step.value = "invalid";
    return;
  }
  status.value = await getInviteStatus(token).catch(() => null);
  if (!status.value?.valid) {
    step.value = "invalid";
    return;
  }
  email.value = status.value.email ?? "";
  step.value = "account";
});

async function join() {
  error.value = null;
  passwordError.value = null;
  if (password.value.length < 12) {
    passwordError.value = t("auth.passwordTooShort");
    return;
  }
  busy.value = true;
  const { data, error: failure } = await auth.signUp
    .email({
      name: name.value,
      email: email.value,
      password: password.value,
      fetchOptions: { headers: { "X-Invite-Token": token } },
    })
    .catch(() => ({ data: null, error: { message: t("errors.network") } }));
  busy.value = false;
  if (failure || !data) {
    const code = (failure as { code?: string } | null)?.code;
    if (code === "INVITE_INVALID" || code === "SIGN_UP_CLOSED") {
      step.value = "invalid";
      return;
    }
    error.value =
      code === "INVITE_EMAIL_MISMATCH"
        ? t("join.emailMismatch")
        : (failure?.message ?? t("auth.setupFailed"));
    return;
  }
  session.markSignedIn({ id: data.user.id, email: data.user.email, name: data.user.name });
  await api("PATCH", "/settings", { body: { locale: locale.value } }).catch(() => undefined);
  step.value = "passkey";
}

async function addPasskey() {
  busy.value = true;
  const result = await auth.passkey.addPasskey({ name: "cloudfinance" });
  busy.value = false;
  if (result?.error) {
    push(t("auth.passkeyFailed"), "error");
    return;
  }
  push(t("auth.passkeyAdded"));
  await router.replace("/budget");
}
</script>

<template>
  <AuthLayout>
    <p v-if="step === 'loading'" class="lede">{{ t("common.loading") }}</p>

    <template v-else-if="step === 'invalid'">
      <h2 class="title">{{ t("join.invalidTitle") }}</h2>
      <p class="lede">{{ t("join.invalidLede") }}</p>
      <UiButton block @click="router.replace('/login')">{{ t("auth.signIn") }}</UiButton>
    </template>

    <template v-else-if="step === 'account'">
      <p v-if="status?.invited_by_name" class="eyebrow">
        {{ t("join.invitedBy", { name: status.invited_by_name }) }}
      </p>
      <h2 class="title">{{ t("join.title") }}</h2>
      <p class="lede">{{ t("join.lede") }}</p>
      <form class="form" @submit.prevent="join">
        <FormField v-slot="{ id }" :label="t('common.name')">
          <input :id="id" v-model="name" class="input" autocomplete="name" required />
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('common.email')"
          :hint="status?.email ? t('join.emailFixed') : undefined"
        >
          <input
            :id="id"
            v-model="email"
            class="input"
            type="email"
            autocomplete="email"
            required
            :readonly="!!status?.email"
          />
        </FormField>
        <FormField
          v-slot="{ id }"
          :label="t('common.password')"
          :hint="t('auth.passwordHint')"
          :error="passwordError ?? error"
        >
          <input
            :id="id"
            v-model="password"
            class="input"
            type="password"
            autocomplete="new-password"
            required
            :aria-invalid="!!(passwordError ?? error)"
          />
        </FormField>
        <UiButton type="submit" variant="primary" block :loading="busy">
          {{ t("join.submit") }}
        </UiButton>
      </form>
    </template>

    <template v-else>
      <h2 class="title">{{ t("auth.passkeyTitle") }}</h2>
      <p class="lede">{{ t("auth.passkeyLede") }}</p>
      <div class="form">
        <UiButton variant="primary" block icon="fingerprint" :loading="busy" @click="addPasskey">
          {{ t("auth.passkeyAdd") }}
        </UiButton>
        <UiButton variant="ghost" block @click="router.replace('/budget')">
          {{ t("auth.passkeySkip") }}
        </UiButton>
      </div>
    </template>
  </AuthLayout>
</template>

<style scoped>
.eyebrow {
  display: inline-block;
  margin-bottom: var(--space-3);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: 600;
}
.title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--text-xl);
  letter-spacing: -0.015em;
}
.lede {
  margin: var(--space-2) 0 var(--space-6);
  color: var(--text-muted);
  font-size: 0.875rem;
}
.form {
  display: grid;
  gap: var(--space-4);
}
</style>
