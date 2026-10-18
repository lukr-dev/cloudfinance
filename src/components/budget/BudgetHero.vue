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
const barLabel = computed(() =>
  t("budget.spentOfAssigned", {
    spent: format(spent.value, props.data.currency),
    assigned: format(assigned.value, props.data.currency),
  }),
);
</script>

<template>
  <section class="hero" :class="`hero--${tone}`">
    <p class="hero__label">
      {{ tone === "over" ? t("budget.overAssigned") : t("budget.readyToAssign") }}
    </p>
    <p class="hero__amount num">
      <span class="hero__code">{{ data.currency }}</span
      >{{ format(rta, data.currency) }}
    </p>

    <dl class="hero__stats">
      <div>
        <dt>{{ t("budget.income") }}</dt>
        <dd class="num">{{ format(data.income_this_month_minor, data.currency) }}</dd>
      </div>
      <div>
        <dt>{{ t("budget.assigned") }}</dt>
        <dd class="num">{{ format(assigned, data.currency) }}</dd>
      </div>
      <div>
        <dt>{{ t("budget.spent") }}</dt>
        <dd class="num">{{ format(spent, data.currency) }}</dd>
      </div>
      <div v-if="timing.kind === 'current'">
        <dt>{{ t("budget.daysLeft") }}</dt>
        <dd class="num">{{ timing.daysLeft }}</dd>
      </div>
    </dl>

    <div
      class="bar"
      :class="{ 'bar--ahead': pace === 'ahead' }"
      role="img"
      :aria-label="barLabel"
      :title="barLabel"
    >
      <div class="bar__fill" :style="{ width: `${spentRatio * 100}%` }" />
      <div
        v-if="timing.kind === 'current'"
        class="bar__today"
        :style="{ left: `${timing.ratio * 100}%` }"
        :title="t('common.today')"
      />
    </div>
  </section>
</template>

<style scoped>
.hero__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-muted);
}
.hero--over .hero__label {
  color: var(--negative);
}
.hero__amount {
  margin: var(--space-1) 0 var(--space-5);
  font-family: var(--font-display);
  font-weight: 300;
  font-size: var(--text-hero);
  letter-spacing: -0.03em;
  line-height: 1;
}
.hero__code {
  font-size: 0.45em;
  letter-spacing: 0;
  color: var(--text-muted);
  margin-right: 0.25em;
  font-weight: 400;
  vertical-align: 0.4em;
}
.hero--done .hero__amount {
  color: var(--positive);
}
.hero--over .hero__amount {
  color: var(--negative);
}
.hero__stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-10);
  margin: 0 0 var(--space-4);
}
.hero__stats div {
  display: grid;
  gap: 2px;
}
.hero__stats dt {
  font-size: var(--text-sm);
  color: var(--text-faint);
}
.hero__stats dd {
  margin: 0;
  font-weight: 600;
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
  top: -5px;
  bottom: -5px;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  border-radius: 1px;
}

@media (max-width: 640px) {
  .hero__amount {
    font-size: 2.75rem;
  }
  .hero__amount {
    margin-bottom: var(--space-4);
  }
  .hero__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
    gap: var(--space-3);
  }
  .hero__stats dt {
    font-size: var(--text-xs);
  }
  .hero__stats dd {
    font-size: 0.9375rem;
  }
}
</style>
