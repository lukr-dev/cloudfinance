import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// Deliberately no remote mode, URL or database-path override. Void resolves its local D1.
if (process.argv.length > 2 || process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("Seed is local development D1 only; arguments and DATABASE_URL are refused.");
  process.exit(1);
}
const execute = (args) =>
  execFileSync("pnpm", ["void", "db", "execute", ...args], { encoding: "utf8" });
execFileSync("pnpm", ["void", "db", "migrate"], { encoding: "utf8" });
const status = execute(["SELECT 'SEED_USERS:' || count(*) AS status FROM user"]);
if (!status.includes("SEED_USERS:1")) {
  console.log("No local user yet. Start vp dev, sign up at /setup, stop dev, then run pnpm seed.");
  process.exit(0);
}
const existing = execute(["SELECT 'SEED_ACCOUNTS:' || count(*) AS status FROM accounts"]);
if (!existing.includes("SEED_ACCOUNTS:0")) {
  console.error(
    "Local accounts already exist. Seed leaves them untouched. To start again, stop dev, run pnpm void db reset --yes, sign up, stop dev, then pnpm seed.",
  );
  process.exit(1);
}
const now = new Date().toISOString();
const user = "(SELECT id FROM user LIMIT 1)";
const literal = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error("Seed money must be safe integer minor units.");
    return String(v);
  }
  return "'" + String(v).replaceAll("'", "''") + "'";
};
const statements = ["BEGIN;"];
const base = (id = randomUUID()) => ({
  id,
  user_id: { sql: user },
  created_at: now,
  updated_at: now,
});
function insert(table, row, suffix = "") {
  const values = Object.values(row).map((v) =>
    v && typeof v === "object" && "sql" in v ? v.sql : literal(v),
  );
  statements.push(
    `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${values.join(",")}) ${suffix};`,
  );
}
function audit(action, entity, entity_id, payload = {}) {
  insert("audit_events", {
    ...base(),
    at: now,
    actor_type: "user",
    actor_id: { sql: user },
    action,
    entity,
    entity_id,
    payload: JSON.stringify(payload),
  });
}
function write(table, row, suffix) {
  insert(table, row, suffix);
  const entityId =
    table === "settings"
      ? { sql: "(SELECT id FROM settings WHERE user_id=" + user + ")" }
      : table === "categories" && row.kind === "income"
        ? { sql: "(SELECT id FROM categories WHERE user_id=" + user + " AND kind='income')" }
        : row.id;
  audit("seed", table, entityId, { source: "demo" });
}
write(
  "settings",
  {
    ...base(),
    base_currency: "CHF",
    enabled_currencies: '["CHF","EUR"]',
    locale: "en",
    theme: "system",
  },
  "ON CONFLICT(user_id) DO UPDATE SET base_currency='CHF',enabled_currencies='[\"CHF\",\"EUR\"]',locale='en',updated_at=excluded.updated_at",
);
write(
  "categories",
  {
    ...base(),
    group_id: null,
    name: "Ready to Assign",
    kind: "income",
    color: "teal",
    note: "",
    hidden: 0,
    sort_order: 0,
  },
  "ON CONFLICT DO NOTHING",
);
const income = { sql: "(SELECT id FROM categories WHERE user_id=" + user + " AND kind='income')" };
const groupNames = [
  ["Fixed costs", "Rent", "Health insurance", "Mobile & Internet", "Utilities", "Insurance"],
  ["Everyday", "Groceries", "Transport", "Eating out", "Personal care", "Household"],
  ["Lifestyle", "Clothing", "Leisure", "Subscriptions", "Gifts"],
  ["Savings goals", "Emergency fund", "Holidays", "Pillar 3a"],
];
const colors = [
  "teal",
  "orange",
  "pink",
  "indigo",
  "violet",
  "amber",
  "red",
  "green",
  "blue",
  "slate",
];
const cats = new Map();
let color = 0;
for (const [i, names] of groupNames.entries()) {
  const group = randomUUID();
  write("category_groups", { ...base(group), name: names[0], sort_order: i, hidden: 0 });
  for (const [j, name] of names.slice(1).entries()) {
    const id = randomUUID();
    cats.set(name, id);
    write("categories", {
      ...base(id),
      group_id: group,
      name,
      kind: "expense",
      color: colors[color++ % colors.length],
      note: "",
      hidden: 0,
      sort_order: j,
    });
  }
}
const accountRows = [
  ["bank", "PostFinance Privatkonto", "checking", "CHF", 1, "postfinance"],
  ["revolut", "Revolut CHF", "checking", "CHF", 1, "revolut"],
  ["eur", "Revolut EUR", "checking", "EUR", 1, "revolut"],
  ["card", "Kreditkarte", "credit_card", "CHF", 1, null],
  ["tracking", "Säule 3a", "investment", "CHF", 0, null],
];
const accountIds = new Map(accountRows.map(([id]) => [id, randomUUID()]));
for (const [i, [id, name, type, currency, on_budget, institution]] of accountRows.entries())
  write("accounts", {
    ...base(accountIds.get(id)),
    name,
    type,
    currency,
    on_budget,
    institution,
    closed_at: null,
    sort_order: i,
  });
let txCount = 0;
function transaction(account, date, amount, payee, category, extra = {}) {
  const id = randomUUID();
  const row = {
    ...base(id),
    account_id: accountIds.get(account),
    date,
    amount_minor: amount,
    currency: account === "eur" ? "EUR" : "CHF",
    payee,
    memo: "",
    category_id: category === "income" ? income : (cats.get(category) ?? null),
    cleared: date.slice(0, 7) === now.slice(0, 7) ? "uncleared" : "cleared",
    transfer_account_id: null,
    transfer_transaction_id: null,
    source: "import:demo",
    external_id: "demo-" + id,
    ...extra,
  };
  write("transactions", row);
  txCount++;
  return row;
}
function transfer(from, to, date, amount, otherAmount, ownCategory, otherCategory) {
  const a = randomUUID(),
    b = randomUUID();
  transaction(from, date, amount, "Transfer", ownCategory, {
    id: a,
    transfer_account_id: accountIds.get(to),
    transfer_transaction_id: b,
  });
  transaction(to, date, otherAmount, "Transfer", otherCategory, {
    id: b,
    transfer_account_id: accountIds.get(from),
    transfer_transaction_id: a,
  });
}
// Linked legs reference each other. SQLite checks these at COMMIT during the local CLI transaction.
statements.push("PRAGMA defer_foreign_keys=ON;");
for (let offset = -2; offset <= 0; offset++) {
  const d = new Date(Date.UTC(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1 + offset, 1));
  const month = d.toISOString().slice(0, 7);
  transaction("bank", month + "-01", 680000, "Lohn — Helvetia Digital AG", "income");
  transaction("bank", month + "-02", -175000, "Miete — Verwaltung Zürich", "Rent");
  transaction("bank", month + "-03", -38900, "CSS Krankenkasse", "Health insurance");
  transaction("bank", month + "-04", -7990, "Swisscom", "Mobile & Internet");
  transaction("bank", month + "-06", -8450, "Migros", "Groceries");
  transaction("bank", month + "-12", -12680, "Coop", "Groceries");
  transaction("card", month + "-16", -9820, "Migros", "Groceries");
  transaction("bank", month + "-07", -8800, "SBB — ZVV", "Transport");
  transaction("revolut", month + "-11", -18750, "Restaurant Zeughauskeller", "Eating out");
  transaction("bank", month + "-10", -12500, "Coiffeur am Bellevue", "Personal care");
  transaction("card", month + "-09", -1790, "Netflix", "Subscriptions");
  transaction("bank", month + "-18", -6500, "EWZ", "Utilities");
  transaction("bank", month + "-14", -3900, "Twint — Markt", null);
  transaction("bank", month + "-17", -2450, "Kiosk", null);
  transfer("bank", "revolut", month + "-05", -50000, 50000);
  transfer("bank", "card", month + "-20", -11610, 11610);
  transfer("bank", "eur", month + "-08", -20000, 21200, "income", "income");
  transaction("eur", month + "-13", -4200, "DB — Konstanz", "Transport");
  transfer("bank", "tracking", month + "-15", -30000, 30000, "Pillar 3a");
  for (const [name, amount] of [
    ["Rent", 175000],
    ["Health insurance", 38900],
    ["Mobile & Internet", 7990],
    ["Utilities", 6500],
    ["Groceries", 50000],
    ["Transport", 10000],
    ["Eating out", 12000],
    ["Personal care", 6000],
    ["Subscriptions", 3000],
    ["Pillar 3a", 30000],
    ["Emergency fund", 50000],
    ["Holidays", 20000],
  ]) {
    write("budget_assignments", {
      ...base(),
      month,
      category_id: cats.get(name),
      currency: "CHF",
      amount_minor: amount,
    });
  }
  write("budget_assignments", {
    ...base(),
    month,
    category_id: cats.get("Transport"),
    currency: "EUR",
    amount_minor: 6000,
  });
}
statements.push("COMMIT;");
const scratch = mkdtempSync(join(tmpdir(), "cloudfinance-seed-"));
try {
  const path = join(scratch, "seed.sql");
  writeFileSync(path, statements.join("\n"), { mode: 0o600 });
  execute(["--file", path]);
  console.log(
    `Seeded local D1: 5 accounts, 17 expense categories, ${txCount} transaction legs, 3 months, CHF + EUR. Ready to Assign stays positive; Eating out and Personal care are overspent.`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
