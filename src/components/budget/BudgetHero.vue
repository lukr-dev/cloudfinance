<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { BudgetMonth } from "../../../shared/schemas";
import { useMoney } from "../../composables/money";
import { currentMonth, daysInMonth } from "../../composables/month";

const props = defineProps<{ data: BudgetMonth }>();
const { t } = useI18n();
const { format } = useMoney();

const rta = computed(() => props.data.ready_to_assign_minor);
const spent = computed(() => Math.max(0, -props.data.activity_this_month_minor));
const assigned = computed(() => props.data.assigned_this_month_minor);
const tone = computed(() => {
  if (rta.value > 0) return "open";
  if (rta.value < 0) return "over";
  // Zero with nothing budgeted yet is a blank slate, not an achievement.
  const started =
    props.data.assigned_this_month_minor !== 0 || props.data.available_total_minor !== 0;
  return started ? "done" : "empty";
});

const timing = computed(() => {
  const now = currentMonth();
  if (props.data.month < now) return { kind: "past" as const, ratio: 1, daysLeft: 0 };
  if (props.data.month > now) return { kind: "future" as const, ratio: 0, daysLeft: 0 };
  const days = daysInMonth(props.data.month);
  const today = new Date().getDate();
  return { kind: "current" as const, ratio: today / days, daysLeft: days - today };
});

const spentRatio = computed(() =>
  assigned.value > 0 ? Math.min(1, spent.value / assigned.value) : spent.value > 0 ? 1 : 0,
);
const pace = computed(() =>
  timing.value.kind === "current" && spentRatio.value > timing.value.ratio + 0.1 ? "ahead" : "ok",
);
</script>

<template>
  <section class="hero" :class="`hero--${tone}`">
    <p class="eyebrow">{{ t("budget.readyToAssign") }}</p>
    <p class="hero__lede">
      {{
        tone === "done"
          ? t("budget.rtaDone", { currency: data.currency })
          : tone === "over"
            ? t("budget.rtaOver")
            : t("budget.rtaLede")
      }}
    </p>

    <div class="hero__figure">
      <span class="hero__amount num">
        <span class="hero__code">{{ data.currency }}</span
        >{{ format(rta, data.currency) }}
      </span>
      <span v-if="tone !== 'done'" class="hero__suffix">
        {{ tone === "over" ? t("budget.overAssigned") : t("budget.toAssign") }}
      </span>
    </div>

    <div class="hero__stats">
      <span
        ><strong class="num">{{ format(data.income_this_month_minor, data.currency) }}</strong>
        {{ t("budget.income") }}</span
      >
      <span
        ><strong class="num">{{ format(assigned, data.currency) }}</strong>
        {{ t("budget.assigned") }}</span
      >
      <span
        ><strong class="num">{{ format(spent, data.currency) }}</strong>
        {{ t("budget.spent") }}</span
      >
      <span v-if="timing.kind === 'current'"
        ><strong class="num">{{ timing.daysLeft }}</strong> {{ t("budget.daysLeft") }}</span
      >
    </div>

    <div
      class="bar"
      :class="{ 'bar--ahead': pace === 'ahead' }"
      role="img"
      :aria-label="`${Math.round(spentRatio * 100)}% ${t('budget.spentOfAssigned')}`"
    >
      <div class="bar__fill" :style="{ width: `${spentRatio * 100}%` }" />
      <div
        v-if="timing.kind === 'current'"
        class="bar__today"
        :style="{ left: `${timing.ratio * 100}%` }"
      />
    </div>
    <div class="bar-legend">
      <span>{{ t("budget.spentOfAssigned") }}</span>
      <span
        v-if="timing.kind === 'current'"
        class="bar-legend__today"
        :style="{ left: `${timing.ratio * 100}%` }"
      >
        {{ t("common.today") }}
      </span>
      <span class="num">{{
        t("budget.assignedTotal", { amount: format(assigned, data.currency) })
      }}</span>
    </div>
  </section>
</template>

<style scoped>
.hero__lede {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.hero__figure {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: var(--space-3) 0 var(--space-2);
}
.hero__amount {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: var(--text-hero);
  letter-spacing: -0.03em;
  line-height: 1;
}
.hero__code {
  font-size: 0.5em;
  letter-spacing: 0;
  color: var(--text-muted);
  margin-right: 0.2em;
  font-weight: 400;
  vertical-align: 0.35em;
}
.hero--done .hero__amount {
  color: var(--positive);
}
.hero--over .hero__amount {
  color: var(--negative);
}
.hero__suffix {
  color: var(--text-muted);
  font-size: var(--text-lg);
}
.hero__stats {
  display: flex;
  gap: var(--space-2) var(--space-8);
  flex-wrap: wrap;
  margin-bottom: var(--space-5);
  color: var(--text-muted);
}
.hero__stats strong {
  font-weight: 600;
  color: var(--text);
  font-size: 1.0625rem;
}
.bar {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--track);
}
.bar__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--accent);
  transition: width 400ms var(--ease-out);
}
.bar--ahead .bar__fill {
  background: var(--caution);
}
.bar__today {
  position: absolute;
  top: -6px;
  bottom: -6px;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  border-radius: 1px;
}
.bar-legend {
  position: relative;
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-3);
  height: 20px;
  font-size: var(--text-sm);
  color: var(--text-faint);
}
.bar-legend__today {
  position: absolute;
  transform: translateX(-50%);
}
@media (max-width: 640px) {
  .hero__amount {
    font-size: 2.5rem;
  }
  .bar-legend__today {
    display: none;
  }
}
</style>
