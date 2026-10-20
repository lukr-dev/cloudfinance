<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import type { Invitation, Member, Settings } from "../../shared/schemas";
import { getMe } from "../api";
import { auth } from "../api/auth";
import { api } from "../api/http";
import PageLayout from "../components/layout/PageLayout.vue";
import CurrencyPicker from "../components/settings/CurrencyPicker.vue";
import InviteDialog from "../components/settings/InviteDialog.vue";
import IconButton from "../components/ui/IconButton.vue";
import SegmentedControl from "../components/ui/SegmentedControl.vue";
import UiButton from "../components/ui/UiButton.vue";
import { currencyName, type CurrencyCode } from "../composables/currencies";
import { useErrorToast } from "../composables/errors";
import type { ThemePreference } from "../composables/theme";
import { formatDateTime } from "../composables/time";
import { useToasts } from "../composables/toasts";
import type { Locale } from "../i18n";
import { useSessionStore } from "../stores/session";
import { useSettingsStore } from "../stores/settings";
import { useUiStore } from "../stores/ui";

type Currency = Settings["base_currency"];
interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt: string | Date;
  deviceType?: string;
}

const { t, locale } = useI18n();
const settings = useSettingsStore();
const session = useSessionStore();
const ui = useUiStore();
const router = useRouter();
const { push } = useToasts();
const showError = useErrorToast();

const passkeys = ref<PasskeyRow[]>([]);
const isAdmin = ref(false);
const members = ref<Member[]>([]);
const invitations = ref<Invitation[]>([]);
const inviteOpen = ref(false);
const pickerOpen = ref(false);
const s = computed(() => settings.settings!);

async function save(patch: Parameters<typeof settings.update>[0]) {
  try {
    await settings.update(patch);
    ui.changed();
    push(t("settings.saved"));
  } catch (e) {
    showError(e);
  }
}

const localeModel = computed({
  get: () => s.value.locale,
  set: (value: Locale) => void save({ locale: value }),
});
const themeModel = computed({
  get: () => s.value.theme,
  set: (value: ThemePreference) => void save({ theme: value }),
});

function enable(code: CurrencyCode) {
  void save({ enabled_currencies: [...s.value.enabled_currencies, code as Currency] });
}
function disable(currency: Currency) {
  void save({ enabled_currencies: s.value.enabled_currencies.filter((c) => c !== currency) });
}

async function loadPasskeys() {
  const { data } = await auth.passkey.listUserPasskeys();
  passkeys.value = (data ?? []) as PasskeyRow[];
}
onMounted(loadPasskeys);

async function loadMembers() {
  try {
    const [m, i] = await Promise.all([
      api<Member[]>("GET", "/members"),
      api<Invitation[]>("GET", "/invitations"),
    ]);
    members.value = m;
    invitations.value = i.filter((x) => x.status === "pending");
  } catch (e) {
    showError(e);
  }
}
onMounted(async () => {
  isAdmin.value = (await getMe().catch(() => null))?.role === "admin";
  if (isAdmin.value) await loadMembers();
});

async function revoke(invitation: Invitation) {
  try {
    await api("DELETE", `/invitations/${invitation.id}`);
    push(t("members.revoked"));
    await loadMembers();
  } catch (e) {
    showError(e);
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

async function addPasskey() {
  const result = await auth.passkey.addPasskey({
    name: `cloudfinance · ${new Date().toLocaleDateString()}`,
  });
  if (result?.error) {
    push(t("auth.passkeyFailed"), "error");
    return;
  }
  push(t("auth.passkeyAdded"));
  await loadPasskeys();
}

async function removePasskey(id: string) {
  const { error } = await auth.passkey.deletePasskey({ id });
  if (error) {
    push(error.message ?? t("errors.generic"), "error");
    return;
  }
  await loadPasskeys();
}

async function signOut() {
  await session.signOut();
  await router.replace("/login");
}
</script>

<template>
  <PageLayout :title="t('settings.title')">
    <div class="settings">
      <section class="group">
        <h2>{{ t("settings.general") }}</h2>

        <div class="row">
          <div class="row__label">{{ t("settings.language") }}</div>
          <SegmentedControl
            v-model="localeModel"
            :label="t('settings.language')"
            :options="[
              { value: 'de', label: 'Deutsch' },
              { value: 'en', label: 'English' },
            ]"
          />
        </div>
        <div class="row">
          <div class="row__label">{{ t("theme.label") }}</div>
          <SegmentedControl
            v-model="themeModel"
            :label="t('theme.label')"
            :options="[
              { value: 'light', label: t('theme.light'), icon: 'sun' },
              { value: 'dark', label: t('theme.dark'), icon: 'moon' },
              { value: 'system', label: t('theme.system'), icon: 'monitor' },
            ]"
          />
        </div>
      </section>

      <section class="group">
        <h2>{{ t("settings.currenciesTitle") }}</h2>
        <div class="row">
          <div class="row__label">
            {{ t("settings.baseCurrency") }}
            <p>{{ t("settings.baseCurrencyHint") }}</p>
          </div>
          <select
            class="input narrow"
            :value="s.base_currency"
            :aria-label="t('settings.baseCurrency')"
            @change="
              save({ base_currency: ($event.target as HTMLSelectElement).value as Currency })
            "
          >
            <option v-for="c in settings.currencies" :key="c" :value="c">
              {{ c }} · {{ currencyName(c, locale) }}
            </option>
          </select>
        </div>

        <div class="row row--stack">
          <div class="row__label">
            {{ t("settings.currencies") }}
            <p>{{ t("settings.currenciesHint") }}</p>
          </div>
          <div class="currencies">
            <span
              v-for="c in settings.currencies"
              :key="c"
              class="chip"
              :title="currencyName(c, locale)"
            >
              {{ c }}
              <IconButton
                v-if="c !== s.base_currency"
                icon="close"
                :size="12"
                :label="`${t('common.delete')} ${c}`"
                @click="disable(c)"
              />
            </span>
            <UiButton size="sm" icon="plus" @click="pickerOpen = true">
              {{ t("settings.addCurrency") }}
            </UiButton>
          </div>
        </div>
      </section>

      <section v-if="isAdmin" class="group">
        <h2>{{ t("members.title") }}</h2>
        <ul class="members">
          <li v-for="m in members" :key="m.user_id" class="member">
            <span class="avatar">{{ initials(m.name || m.email) }}</span>
            <span class="member__who">
              {{ m.name
              }}<span v-if="m.user_id === session.user?.id" class="you">
                · {{ t("members.you") }}</span
              >
              <small>{{ m.email }}</small>
            </span>
            <span class="role" :class="`role--${m.role}`">{{ t(`members.roles.${m.role}`) }}</span>
          </li>
        </ul>

        <div class="row row--top invites">
          <div class="row__label">
            {{ t("members.invitations") }}
            <p>{{ t("members.invitationsHint") }}</p>
          </div>
          <div class="invites__list">
            <div v-for="inv in invitations" :key="inv.id" class="invite">
              <span>
                {{ inv.email ?? t("members.anyone") }}
                <small>{{
                  t("members.expires", { date: formatDateTime(inv.expires_at, locale) })
                }}</small>
              </span>
              <UiButton size="sm" variant="ghost" @click="revoke(inv)">{{
                t("members.revoke")
              }}</UiButton>
            </div>
            <UiButton size="sm" icon="user-plus" @click="inviteOpen = true">{{
              t("members.invite")
            }}</UiButton>
          </div>
        </div>
      </section>

      <section class="group">
        <h2>{{ t("settings.security") }}</h2>
        <div class="row row--top">
          <div class="row__label">{{ t("settings.passkeys") }}</div>
          <div class="passkeys">
            <p v-if="!passkeys.length" class="muted">{{ t("settings.noPasskeys") }}</p>
            <div v-for="p in passkeys" :key="p.id" class="passkey">
              <span>
                {{ p.name || "Passkey" }}
                <small>{{ formatDateTime(new Date(p.createdAt).toISOString(), locale) }}</small>
              </span>
              <UiButton size="sm" variant="ghost" @click="removePasskey(p.id)">{{
                t("settings.removePasskey")
              }}</UiButton>
            </div>
            <UiButton size="sm" icon="fingerprint" @click="addPasskey">{{
              t("settings.addPasskey")
            }}</UiButton>
          </div>
        </div>
      </section>

      <section class="group">
        <h2>{{ t("settings.account") }}</h2>
        <div class="row">
          <div class="row__label">
            {{ session.user?.name }}
            <p>{{ session.user?.email }}</p>
          </div>
          <UiButton icon="logout" @click="signOut">{{ t("nav.signOut") }}</UiButton>
        </div>
      </section>
    </div>
    <CurrencyPicker v-model:open="pickerOpen" :enabled="s.enabled_currencies" @pick="enable" />
    <InviteDialog v-model:open="inviteOpen" @created="loadMembers" />
  </PageLayout>
</template>

<style scoped>
.settings {
  max-width: 760px;
  display: grid;
  gap: var(--space-10);
}
.group h2 {
  font-size: var(--text-lg);
  font-weight: 600;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--border);
}
.row--top {
  align-items: flex-start;
}
.row__label {
  font-weight: 500;
}
.row__label p {
  font-weight: 400;
  font-size: var(--text-sm);
  color: var(--text-muted);
  max-width: 44ch;
  margin-top: 2px;
}
.narrow {
  width: auto;
  min-width: 120px;
}
.currencies {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-2);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 30px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.chip :deep(.icon-button) {
  width: 22px;
  height: 22px;
  margin-right: -8px;
}
.passkeys {
  display: grid;
  justify-items: end;
  gap: var(--space-2);
  min-width: 280px;
}
.passkey {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  font-size: 0.875rem;
}
.passkey small {
  display: block;
  color: var(--text-faint);
  font-size: var(--text-xs);
}
.members {
  list-style: none;
  margin: 0;
  padding: 0;
}
.member {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}
.avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: 700;
}
.member__who {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}
.member__who small {
  display: block;
  font-weight: 400;
  font-size: var(--text-sm);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
.you {
  font-weight: 400;
  color: var(--text-faint);
}
.role {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  color: var(--text-muted);
}
.role--admin {
  background: var(--ink);
  color: var(--text-inverse);
}
.invites__list {
  display: grid;
  justify-items: end;
  gap: var(--space-2);
  min-width: 280px;
}
.invite {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  font-size: 0.875rem;
}
.invite small {
  display: block;
  color: var(--text-faint);
  font-size: var(--text-xs);
}
@media (max-width: 640px) {
  .invites__list {
    justify-items: stretch;
    min-width: 0;
  }
  .settings {
    gap: var(--space-8);
  }
  .row {
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .row--top,
  .row--stack {
    flex-direction: column;
    align-items: stretch;
  }
  .currencies,
  .passkeys {
    justify-content: flex-start;
    justify-items: stretch;
    min-width: 0;
  }
}
</style>
