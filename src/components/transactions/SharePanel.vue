<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ShareContact } from "../../../shared/schemas";
import { useMoney } from "../../composables/money";
import {
  formatPercent,
  parsePercent,
  previewSplit,
  type ShareDraft,
  type SplitMethod,
} from "../../composables/split";
import AppIcon from "../ui/AppIcon.vue";
import IconButton from "../ui/IconButton.vue";
import SegmentedControl from "../ui/SegmentedControl.vue";

/** "Split with someone": who shares this entry and how much each person's part is. */
const props = defineProps<{
  /** Signed total in minor units; 0 while the amount field is empty. */
  total: number;
  currency: string;
  contacts: ShareContact[];
  error?: string | null;
}>();
const draft = defineModel<ShareDraft>({ required: true });
const { t } = useI18n();
const { format, parse, toInput } = useMoney();

const PALETTE = ["indigo", "orange", "pink", "teal", "violet", "amber", "blue", "green"] as const;
const colorOf = (index: number) => `var(--cat-${PALETTE[index % PALETTE.length]})`;

const values = computed(() =>
  draft.value.people.map((p) => {
    if (draft.value.method === "percent") return parsePercent(p.value);
    if (draft.value.method === "amount") {
      const minor = parse(p.value, props.currency);
      return minor === null ? null : Math.abs(minor);
    }
    return null;
  }),
);
const preview = computed(() => previewSplit(props.total, draft.value.method, values.value));
const abs = computed(() => Math.abs(props.total));
const shareOf = (part: number | null) =>
  abs.value && part !== null ? Math.min(100, (Math.abs(part) / abs.value) * 100) : 0;

const methodOptions = computed(() => [
  { value: "equal" as const, label: t("share.equal") },
  { value: "percent" as const, label: "%" },
  { value: "amount" as const, label: t("share.amount") },
]);

/** Switching method keeps the current split as a starting point. */
function setMethod(next: SplitMethod) {
  const current = preview.value.shares;
  draft.value = {
    method: next,
    people: draft.value.people.map((p, i) => {
      const part = current[i];
      let value = "";
      if (part !== null && part !== undefined && abs.value) {
        if (next === "percent") value = formatPercent((Math.abs(part) / abs.value) * 10000);
        if (next === "amount") value = toInput(Math.abs(part), props.currency);
      }
      return { ...p, value };
    }),
  };
}
const method = computed({ get: () => draft.value.method, set: setMethod });

function add() {
  const n = draft.value.people.length + 1;
  const value =
    draft.value.method === "percent"
      ? formatPercent(Math.trunc(10000 / (n + 1)))
      : draft.value.method === "amount" && abs.value
        ? toInput(Math.trunc(abs.value / (n + 1)), props.currency)
        : "";
  draft.value = { ...draft.value, people: [...draft.value.people, { email: "", value }] };
}
function remove(index: number) {
  draft.value = { ...draft.value, people: draft.value.people.filter((_, i) => i !== index) };
}
function update(index: number, patch: { email?: string; value?: string }) {
  draft.value = {
    ...draft.value,
    people: draft.value.people.map((p, i) => {
      if (i !== index) return p;
      const next = { ...p, ...patch };
      if (patch.email !== undefined)
        next.name = props.contacts.find(
          (c) => c.email.toLowerCase() === patch.email!.trim().toLowerCase(),
        )?.name;
      return next;
    }),
  };
}
const amountOf = (part: number | null | undefined) =>
  part === null || part === undefined ? "—" : format(Math.abs(part), props.currency);
</script>

<template>
  <button v-if="!draft.people.length" type="button" class="split-trigger" @click="add">
    <span class="split-trigger__icon"><AppIcon name="users" :size="16" /></span>
    <span>
      <strong>{{ t("share.trigger") }}</strong>
      <small>{{ t("share.triggerHint") }}</small>
    </span>
  </button>

  <section v-else class="split" :aria-label="t('share.title')">
    <header class="split__head">
      <h3><AppIcon name="users" :size="15" :stroke-width="2" />{{ t("share.title") }}</h3>
      <SegmentedControl v-model="method" :label="t('share.method')" :options="methodOptions" />
    </header>

    <div class="split__bar" aria-hidden="true">
      <span class="split__seg split__seg--you" :style="{ flexGrow: shareOf(preview.own) }" />
      <span
        v-for="(part, i) in preview.shares"
        :key="i"
        class="split__seg"
        :style="{ flexGrow: shareOf(part), background: colorOf(i) }"
      />
    </div>

    <ul class="split__people">
      <li class="person person--you">
        <span class="person__dot person__dot--you" />
        <span class="person__who">{{ t("share.you") }}</span>
        <span class="person__amount num">{{ amountOf(preview.own) }}</span>
      </li>
      <li
        v-for="(person, i) in draft.people"
        :key="i"
        class="person"
        :class="{ 'person--declined': person.status === 'declined' }"
      >
        <span class="person__dot" :style="{ background: colorOf(i) }" />
        <span class="person__who">
          <input
            class="input input--sm"
            type="email"
            list="share-contacts"
            autocomplete="off"
            spellcheck="false"
            required
            :placeholder="t('share.emailPlaceholder')"
            :aria-label="t('share.email')"
            :value="person.email"
            @input="update(i, { email: ($event.target as HTMLInputElement).value })"
          />
          <small v-if="person.status === 'declined'" class="declined">{{
            t("share.declined")
          }}</small>
          <small v-else-if="person.name" class="name">{{ person.name }}</small>
        </span>
        <label v-if="method !== 'equal'" class="person__value">
          <input
            class="input input--sm num"
            inputmode="decimal"
            :aria-label="method === 'percent' ? t('share.percent') : t('share.amount')"
            :placeholder="method === 'percent' ? '50' : '0.00'"
            :value="person.value"
            @input="update(i, { value: ($event.target as HTMLInputElement).value })"
          />
          <span class="unit">{{ method === "percent" ? "%" : currency }}</span>
        </label>
        <span v-if="method !== 'amount'" class="person__amount num">{{
          amountOf(preview.shares[i])
        }}</span>
        <IconButton icon="close" :size="14" :label="t('share.remove')" @click="remove(i)" />
      </li>
    </ul>
    <datalist id="share-contacts">
      <option v-for="c in contacts" :key="c.user_id" :value="c.email">{{ c.name }}</option>
    </datalist>

    <footer class="split__foot">
      <button type="button" class="add" @click="add">
        <AppIcon name="user-plus" :size="15" :stroke-width="2" />{{ t("share.add") }}
      </button>
      <p v-if="error" class="msg msg--error" role="alert">{{ error }}</p>
      <p v-else-if="preview.error === 'over'" class="msg msg--error" role="alert">
        {{ t("share.over", { amount: format(abs, currency) }) }}
      </p>
      <p v-else class="msg">
        {{
          t("share.ownHint", { amount: format(Math.abs(preview.own), currency, { code: true }) })
        }}
      </p>
    </footer>
  </section>
</template>

<style scoped>
.split-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  background: none;
  text-align: left;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}
.split-trigger:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--text);
}
.split-trigger:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.split-trigger__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-sunken);
  color: var(--accent);
}
.split-trigger strong {
  display: block;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}
.split-trigger small {
  font-size: var(--text-xs);
}

.split {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-sunken);
}
.split__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.split__head h3 {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
}
.split__head h3 :deep(svg) {
  color: var(--accent);
}
.split__bar {
  display: flex;
  gap: 2px;
  height: 6px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: var(--track);
}
.split__seg {
  flex-basis: 0;
  min-width: 0;
  transition: flex-grow var(--duration-base) var(--ease-out);
}
.split__seg--you {
  background: var(--ink);
}
.split__people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.person {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-1) 0;
  border-top: 1px solid var(--border);
}
.person--you {
  border-top: 0;
  min-height: 32px;
}
.person__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.person__dot--you {
  background: var(--ink);
}
.person__who {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
  font-size: var(--text-sm);
  font-weight: 500;
}
.person__who small {
  font-size: var(--text-xs);
  font-weight: 400;
  padding-left: 2px;
}
.name {
  color: var(--text-faint);
}
.declined {
  color: var(--caution);
}
.person--declined .person__amount {
  text-decoration: line-through;
  color: var(--text-faint);
}
.input--sm {
  height: 32px;
  font-size: var(--text-sm);
}
.person__value {
  position: relative;
  flex: none;
  width: 108px;
}
.person__value .input {
  padding-right: 40px;
  text-align: right;
}
.unit {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-faint);
  pointer-events: none;
}
.person__amount {
  flex: none;
  min-width: 76px;
  text-align: right;
  font-size: var(--text-sm);
  color: var(--text-muted);
}
.person--you .person__amount {
  color: var(--text);
  font-weight: 600;
  /* Line up with the participants' amounts, which have a remove button after them. */
  margin-right: calc(32px + var(--space-2));
}
.split__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
}
.add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
}
.add:hover {
  color: var(--accent-hover);
}
.msg {
  font-size: var(--text-xs);
  color: var(--text-faint);
}
.msg--error {
  color: var(--negative);
}
@media (max-width: 760px) {
  .split {
    padding: var(--space-3);
  }
  .split__head {
    flex-wrap: wrap;
  }
  .person {
    flex-wrap: wrap;
  }
  .person:not(.person--you) .person__who {
    flex-basis: calc(100% - 48px);
  }
  .person__value {
    margin-left: 16px;
  }
  .person__amount {
    margin-left: auto;
  }
}
</style>
