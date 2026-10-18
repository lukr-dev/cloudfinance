<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { setLocale, type Locale } from "../../i18n";
import BrandMark from "./BrandMark.vue";

const { t, locale } = useI18n();

const sample = computed(() =>
  (locale.value === "de"
    ? ["Miete", "Lebensmittel", "Ferien", "Notgroschen"]
    : ["Rent", "Groceries", "Holidays", "Emergency fund"]
  ).map((name, i) => [name, ["2’150.00", "600.00", "800.00", "1’500.00"][i]]),
);

function switchLocale(next: Locale) {
  setLocale(next);
}
</script>

<template>
  <div class="auth">
    <section class="auth__story">
      <BrandMark />
      <div class="auth__copy">
        <h1>{{ t("auth.headline") }}</h1>
      </div>

      <figure class="ledger-card" aria-hidden="true">
        <div class="ledger-card__head">
          <span>{{ t("budget.readyToAssign") }}</span>
          <span class="faint">CHF</span>
        </div>
        <div class="ledger-card__figure num">0.00</div>
        <ul>
          <li v-for="[name, amount] in sample" :key="name">
            <span>{{ name }}</span
            ><span class="num">{{ amount }}</span>
          </li>
        </ul>
      </figure>

      <div class="auth__locale" role="group" :aria-label="t('auth.language')">
        <button
          v-for="l in ['de', 'en'] as const"
          :key="l"
          type="button"
          :aria-pressed="locale === l"
          @click="switchLocale(l)"
        >
          {{ l.toUpperCase() }}
        </button>
      </div>
    </section>

    <section class="auth__panel">
      <div class="auth__form">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped>
.auth {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(400px, 1fr);
  min-height: 100%;
}

.auth__story {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  padding: var(--space-8) clamp(var(--space-8), 6vw, 96px);
  background:
    radial-gradient(1200px 600px at 0% 100%, var(--accent-soft), transparent 60%),
    var(--surface-sunken);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.auth__copy {
  margin-top: auto;
  max-width: 560px;
}

.auth__copy h1 {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: clamp(2.25rem, 4vw, 3.5rem);
  line-height: 1.08;
  letter-spacing: -0.025em;
}

.ledger-card {
  margin: 0 0 auto;
  width: min(340px, 100%);
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  box-shadow: var(--shadow-pop);
  transform: rotate(-1.2deg);
}

.ledger-card__head {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  font-weight: 500;
}

.ledger-card__figure {
  font-family: var(--font-display);
  font-weight: 300;
  font-size: 2.75rem;
  letter-spacing: -0.03em;
  color: var(--positive);
  margin: var(--space-2) 0 var(--space-4);
}

.ledger-card ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ledger-card li {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
  font-size: 0.875rem;
  color: var(--text-muted);
}

.ledger-card li .num {
  color: var(--text);
}

.auth__locale {
  position: absolute;
  top: var(--space-8);
  right: var(--space-8);
  display: flex;
  gap: 2px;
}

.auth__locale button {
  border: 0;
  background: none;
  cursor: pointer;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.auth__locale button[aria-pressed="true"] {
  color: var(--text);
  background: var(--surface-hover);
}

.auth__panel {
  display: grid;
  place-items: center;
  padding: var(--space-8);
}

.auth__form {
  width: min(380px, 100%);
}

/* Phones and tablets: brand and language on top, the form right below. */
@media (max-width: 880px) {
  .auth {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .auth__story {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    padding-top: calc(var(--space-4) + env(safe-area-inset-top));
    background: none;
    border-right: 0;
  }
  .auth__copy,
  .ledger-card {
    display: none;
  }
  .auth__locale {
    position: static;
  }
  .auth__panel {
    place-items: start center;
    padding: var(--space-8) var(--space-5) var(--space-10);
  }
}
</style>
