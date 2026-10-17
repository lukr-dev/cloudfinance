<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { auth } from "../api/auth";
import AuthLayout from "../components/layout/AuthLayout.vue";
import FormField from "../components/ui/FormField.vue";
import UiButton from "../components/ui/UiButton.vue";
import { useSessionStore } from "../stores/session";

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();

const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const busy = ref<"password" | "passkey" | null>(null);

async function finish() {
  await session.load(true);
  await router.replace("/budget");
}

async function submit() {
  error.value = null;
  busy.value = "password";
  const { error: failure } = await auth.signIn
    .email({ email: email.value, password: password.value })
    .catch(() => ({ error: { message: t("errors.network") } }));
  busy.value = null;
  if (failure) {
    error.value = t("auth.invalid");
    return;
  }
  await finish();
}

async function withPasskey() {
  error.value = null;
  busy.value = "passkey";
  const result = await auth.signIn.passkey().catch(() => ({ error: true }));
  busy.value = null;
  if (result?.error) {
    error.value = t("auth.passkeyFailed");
    return;
  }
  await finish();
}
</script>

<template>
  <AuthLayout>
    <h2 class="title">{{ t("auth.signInTitle") }}</h2>

    <UiButton block icon="fingerprint" :loading="busy === 'passkey'" @click="withPasskey">
      {{ t("auth.withPasskey") }}
    </UiButton>

    <div class="or">
      <span>{{ t("auth.or") }}</span>
    </div>

    <form class="form" @submit.prevent="submit">
      <FormField v-slot="{ id }" :label="t('common.email')">
        <input
          :id="id"
          v-model="email"
          class="input"
          type="email"
          autocomplete="username webauthn"
          required
        />
      </FormField>
      <FormField v-slot="{ id }" :label="t('common.password')" :error="error">
        <input
          :id="id"
          v-model="password"
          class="input"
          type="password"
          autocomplete="current-password"
          required
          :aria-invalid="!!error"
        />
      </FormField>
      <UiButton type="submit" variant="primary" block :loading="busy === 'password'">
        {{ t("auth.signIn") }}
      </UiButton>
    </form>
  </AuthLayout>
</template>

<style scoped>
.title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--text-xl);
  letter-spacing: -0.015em;
  margin-bottom: var(--space-6);
}
.or {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-5) 0;
  color: var(--text-faint);
  font-size: var(--text-sm);
}
.or::before,
.or::after {
  content: "";
  flex: 1;
  border-top: 1px solid var(--border);
}
.form {
  display: grid;
  gap: var(--space-4);
}
.form :deep(.ui-button[type="submit"]) {
  margin-top: var(--space-2);
}
</style>
