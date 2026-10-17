<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { auth } from "../api/auth";
import { api } from "../api/http";
import AuthLayout from "../components/layout/AuthLayout.vue";
import FormField from "../components/ui/FormField.vue";
import UiButton from "../components/ui/UiButton.vue";
import { useToasts } from "../composables/toasts";
import { useSessionStore } from "../stores/session";

const { t, locale } = useI18n();
const router = useRouter();
const session = useSessionStore();
const { push } = useToasts();

const step = ref<"account" | "passkey">("account");
const name = ref("");
const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const passwordError = ref<string | null>(null);
const busy = ref(false);

async function createAccount() {
  error.value = null;
  passwordError.value = null;
  if (password.value.length < 12) {
    passwordError.value = t("auth.passwordTooShort");
    return;
  }
  busy.value = true;
  const { data, error: failure } = await auth.signUp
    .email({ name: name.value, email: email.value, password: password.value })
    .catch(() => ({ data: null, error: { message: t("errors.network") } }));
  busy.value = false;
  if (failure || !data) {
    error.value = failure?.message ?? t("auth.setupFailed");
    return;
  }
  session.markSignedIn({ id: data.user.id, email: data.user.email, name: data.user.name });
  // Keep the language chosen on this screen as the account default.
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
    <template v-if="step === 'account'">
      <h2 class="title">{{ t("auth.setupTitle") }}</h2>
      <p class="lede">{{ t("auth.setupLede") }}</p>
      <form class="form" @submit.prevent="createAccount">
        <FormField v-slot="{ id }" :label="t('common.name')">
          <input :id="id" v-model="name" class="input" autocomplete="name" required />
        </FormField>
        <FormField v-slot="{ id }" :label="t('common.email')">
          <input
            :id="id"
            v-model="email"
            class="input"
            type="email"
            autocomplete="email"
            required
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
          {{ t("auth.setupSubmit") }}
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
