import { sql } from "void/db";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  foreignKey,
  type AnySQLiteColumn,
} from "void/schema-d1";

const authUser = sqliteTable("user", { id: text("id").primaryKey() });
const base = () => ({
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});
const owned = (table: { user_id: AnySQLiteColumn; id: AnySQLiteColumn }, name: string) =>
  uniqueIndex(name).on(table.user_id, table.id);
export const settings = sqliteTable(
  "settings",
  {
    ...base(),
    base_currency: text("base_currency").notNull().default("CHF"),
    enabled_currencies: text("enabled_currencies", { mode: "json" }).$type<string[]>().notNull(),
    locale: text("locale", { enum: ["de", "en"] })
      .notNull()
      .default("en"),
    theme: text("theme", { enum: ["light", "dark", "system"] })
      .notNull()
      .default("system"),
  },
  (t) => [
    uniqueIndex("settings_user").on(t.user_id),
    check("settings_locale", sql`${t.locale} IN ('de','en')`),
    check("settings_theme", sql`${t.theme} IN ('light','dark','system')`),
    check(
      "settings_currencies_json",
      sql`json_valid(${t.enabled_currencies}) AND json_type(${t.enabled_currencies}) = 'array'`,
    ),
  ],
);
export const accounts = sqliteTable(
  "accounts",
  {
    ...base(),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["checking", "savings", "credit_card", "cash", "investment", "other"],
    }).notNull(),
    currency: text("currency").notNull(),
    on_budget: integer("on_budget", { mode: "boolean" }).notNull().default(true),
    institution: text("institution"),
    closed_at: text("closed_at"),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (t) => [
    owned(t, "accounts_owner_id"),
    index("accounts_user_order").on(t.user_id, t.sort_order),
    uniqueIndex("accounts_owner_id_currency").on(t.user_id, t.id, t.currency),
    check(
      "accounts_type",
      sql`${t.type} IN ('checking','savings','credit_card','cash','investment','other')`,
    ),
    check("accounts_boolean", sql`${t.on_budget} IN (0,1)`),
    check("accounts_currency", sql`${t.currency} IN ('CHF','EUR','USD','GBP','JPY')`),
  ],
);
export const categoryGroups = sqliteTable(
  "category_groups",
  {
    ...base(),
    name: text("name").notNull(),
    sort_order: integer("sort_order").notNull().default(0),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    owned(t, "groups_owner_id"),
    index("groups_user_order").on(t.user_id, t.sort_order),
    check("groups_boolean", sql`${t.hidden} IN (0,1)`),
  ],
);
export const categories = sqliteTable(
  "categories",
  {
    ...base(),
    group_id: text("group_id"),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["expense", "income"] })
      .notNull()
      .default("expense"),
    color: text("color").notNull(),
    note: text("note").notNull().default(""),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (t) => [
    owned(t, "categories_owner_id"),
    uniqueIndex("one_income_category")
      .on(t.user_id)
      .where(sql`${t.kind} = 'income'`),
    index("categories_group_order").on(t.user_id, t.group_id, t.sort_order),
    foreignKey({
      columns: [t.user_id, t.group_id],
      foreignColumns: [categoryGroups.user_id, categoryGroups.id],
    }),
    check(
      "categories_kind",
      sql`(${t.kind}='income' AND ${t.group_id} IS NULL) OR (${t.kind}='expense' AND ${t.group_id} IS NOT NULL)`,
    ),
    check(
      "categories_color",
      sql`${t.color} IN ('teal','orange','pink','indigo','violet','amber','red','green','blue','slate')`,
    ),
    check("categories_boolean", sql`${t.hidden} IN (0,1)`),
  ],
);
export const budgetAssignments = sqliteTable(
  "budget_assignments",
  {
    ...base(),
    month: text("month").notNull(),
    category_id: text("category_id").notNull(),
    currency: text("currency").notNull(),
    amount_minor: integer("amount_minor").notNull(),
  },
  (t) => [
    uniqueIndex("assignments_user_month_category_currency").on(
      t.user_id,
      t.month,
      t.category_id,
      t.currency,
    ),
    index("assignments_user_currency_month").on(t.user_id, t.currency, t.month),
    foreignKey({
      columns: [t.user_id, t.category_id],
      foreignColumns: [categories.user_id, categories.id],
    }),
    check(
      "assignments_month",
      sql`${t.month} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(${t.month},6,2) BETWEEN '01' AND '12'`,
    ),
    check(
      "assignments_amount",
      sql`typeof(${t.amount_minor})='integer' AND abs(${t.amount_minor})<=9007199254740991`,
    ),
    check("assignments_currency", sql`${t.currency} IN ('CHF','EUR','USD','GBP','JPY')`),
  ],
);
export const transactions = sqliteTable(
  "transactions",
  {
    ...base(),
    account_id: text("account_id").notNull(),
    date: text("date").notNull(),
    amount_minor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    payee: text("payee").notNull().default(""),
    memo: text("memo").notNull().default(""),
    category_id: text("category_id"),
    cleared: text("cleared", { enum: ["uncleared", "cleared", "reconciled"] })
      .notNull()
      .default("uncleared"),
    transfer_account_id: text("transfer_account_id"),
    transfer_transaction_id: text("transfer_transaction_id").references(
      (): AnySQLiteColumn => transactions.id,
      { onDelete: "no action" },
    ),
    source: text("source").notNull(),
    external_id: text("external_id"),
  },
  (t) => [
    owned(t, "transactions_owner_id"),
    index("transactions_account_date").on(t.user_id, t.account_id, t.date, t.id),
    index("transactions_category_date").on(t.user_id, t.category_id, t.date, t.id),
    index("transactions_user_date").on(t.user_id, t.date, t.id),
    uniqueIndex("transactions_external_id").on(t.user_id, t.account_id, t.external_id),
    foreignKey({
      columns: [t.user_id, t.account_id, t.currency],
      foreignColumns: [accounts.user_id, accounts.id, accounts.currency],
    }),
    foreignKey({
      columns: [t.user_id, t.category_id],
      foreignColumns: [categories.user_id, categories.id],
    }),
    foreignKey({
      columns: [t.user_id, t.transfer_account_id],
      foreignColumns: [accounts.user_id, accounts.id],
    }),
    check(
      "transactions_amount",
      sql`typeof(${t.amount_minor})='integer' AND abs(${t.amount_minor})<=9007199254740991`,
    ),
    check("transactions_cleared", sql`${t.cleared} IN ('uncleared','cleared','reconciled')`),
    check(
      "transactions_source",
      sql`${t.source} IN ('manual','api','mcp') OR ${t.source} GLOB 'import:?*'`,
    ),
    check(
      "transactions_transfer_pair",
      sql`(${t.transfer_account_id} IS NULL) = (${t.transfer_transaction_id} IS NULL)`,
    ),
    check(
      "transactions_date",
      sql`${t.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${t.date},'+0 days') = ${t.date}`,
    ),
  ],
);
export const auditEvents = sqliteTable(
  "audit_events",
  {
    ...base(),
    at: text("at").notNull(),
    actor_type: text("actor_type", { enum: ["user", "api_key"] }).notNull(),
    actor_id: text("actor_id").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entity_id: text("entity_id").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    index("audit_user_at").on(t.user_id, t.at, t.id),
    check("audit_actor_type", sql`${t.actor_type} IN ('user','api_key')`),
    check("audit_payload_json", sql`json_valid(${t.payload})`),
  ],
);
