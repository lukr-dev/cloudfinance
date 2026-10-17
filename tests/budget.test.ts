import { beforeAll, afterAll, expect, it, vi } from "vite-plus/test";
vi.mock("void/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("void/db")>();
  const holder = { db: undefined as typeof original.db | undefined };
  return {
    ...original,
    db: new Proxy({}, { get: (_target, key) => Reflect.get(holder.db!, key) }),
    testHolder: holder,
  };
});
import { testDatabase } from "./database";
import * as dbModule from "void/db";
import { getSettings, updateSettings, incomeCategory } from "../server/settings";
import { createAccount, listAccounts } from "../server/accounts";
import { createGroup, createCategory, deleteCategory } from "../server/categories";
import { assignToCategory, getBudgetMonth, getCategoryMonth, moveMoney } from "../server/budget";
import {
  createTransactions,
  deleteTransaction,
  getTransaction,
  updateTransaction,
  listTransactions,
} from "../server/transactions";
import type { AuthContext } from "../shared/auth";
const ctx: AuthContext = {
  id: "unit-user",
  email: "unit@example.com",
  name: "Unit",
  via: "api_key",
  api_key_id: "key-1",
};
let fixture: ReturnType<typeof testDatabase>;
let account: string,
  second: string,
  eur: string,
  off: string,
  food: string,
  income: string,
  other: string;
beforeAll(async () => {
  fixture = testDatabase();
  (dbModule as unknown as { testHolder: { db: typeof dbModule.db } }).testHolder.db = fixture.db;
  fixture.sqlite.exec(
    `INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('unit-user','Unit','unit@example.com',0,0,0)`,
  );
  await getSettings(ctx);
  await updateSettings(ctx, { enabled_currencies: ["CHF", "EUR"] });
  income = (await incomeCategory(ctx)).id;
  account = (await createAccount(ctx, { name: "Bank", type: "checking", currency: "CHF" })).id;
  second = (await createAccount(ctx, { name: "Wallet", type: "cash", currency: "CHF" })).id;
  eur = (await createAccount(ctx, { name: "Euro", type: "checking", currency: "EUR" })).id;
  off = (
    await createAccount(ctx, {
      name: "Tracking",
      type: "investment",
      currency: "CHF",
      on_budget: false,
    })
  ).id;
  const group = await createGroup(ctx, { name: "Everyday" });
  food = (await createCategory(ctx, { name: "Food", group_id: group.id })).id;
  other = (await createCategory(ctx, { name: "Travel", group_id: group.id })).id;
});
afterAll(() => fixture?.sqlite.close());
it("initializes defaults lazily and keeps exactly one income category", async () => {
  expect(await getSettings(ctx)).toMatchObject({
    base_currency: "CHF",
    locale: "en",
    theme: "system",
  });
  expect(
    fixture.sqlite.prepare("SELECT count(*) n FROM categories WHERE kind='income'").get()?.n,
  ).toBe(1);
});
it("rolls over negative balances, subtracts future assignments from RTA, isolates currencies and excludes tracking", async () => {
  await createTransactions(ctx, {
    transactions: [
      { account_id: account, date: "2026-07-25", amount_minor: 100000, category_id: income },
      { account_id: account, date: "2026-07-26", amount_minor: -12000, category_id: food },
      { account_id: account, date: "2026-08-01", amount_minor: -1000, category_id: food },
      { account_id: account, date: "2026-08-02", amount_minor: -100 },
      { account_id: off, date: "2026-08-02", amount_minor: 900000 },
      { account_id: eur, date: "2026-08-02", amount_minor: 5000, category_id: income },
    ],
  });
  await assignToCategory(ctx, "2026-07", food, { currency: "CHF", amount_minor: 10000 });
  await assignToCategory(ctx, "2026-08", food, { currency: "CHF", amount_minor: 500 });
  await assignToCategory(ctx, "2027-01", food, { currency: "CHF", amount_minor: 3000 });
  expect(
    fixture.sqlite
      .prepare(
        "SELECT count(*) n FROM audit_events e JOIN budget_assignments a ON e.entity_id=a.id WHERE e.action='assign'",
      )
      .get()?.n,
  ).toBe(3);
  const july = await getBudgetMonth(ctx, "2026-07", "CHF"),
    aug = await getBudgetMonth(ctx, "2026-08", "CHF");
  expect(july).toMatchObject({
    ready_to_assign_minor: 86500,
    available_total_minor: -2000,
    income_this_month_minor: 100000,
  });
  expect(aug).toMatchObject({
    ready_to_assign_minor: 86500,
    activity_this_month_minor: -1000,
    available_total_minor: -2500,
    uncategorized_count: 1,
  });
  expect(aug.groups[0]?.categories.find((c) => c.id === food)).toMatchObject({
    carried_over_minor: -2000,
    assigned_minor: 500,
    activity_minor: -1000,
    available_minor: -2500,
  });
  expect(await getBudgetMonth(ctx, "2026-08", "EUR")).toMatchObject({
    ready_to_assign_minor: 5000,
    available_total_minor: 0,
    uncategorized_count: 0,
  });
  expect(await getCategoryMonth(ctx, "2026-08", food, "CHF")).toMatchObject({
    assigned_last_month_minor: 10000,
    spent_last_month_minor: 12000,
    average_spent_3m_minor: 4000,
  });
});
it("keeps same-currency transfers neutral, shifts cross-currency RTA and categorizes tracking transfers", async () => {
  const neutral = await createTransactions(ctx, {
    account_id: account,
    date: "2026-08-05",
    amount_minor: -2000,
    transfer_account_id: second,
  });
  expect(neutral.created).toHaveLength(2);
  expect(neutral.created.every((t) => t.category_id === null)).toBe(true);
  expect(await getBudgetMonth(ctx, "2026-08", "CHF")).toMatchObject({
    ready_to_assign_minor: 86500,
    uncategorized_count: 1,
  });
  const cross = await createTransactions(ctx, {
    account_id: account,
    date: "2026-08-06",
    amount_minor: -1000,
    transfer_account_id: eur,
    transfer_amount_minor: 950,
  });
  expect(cross.created.every((t) => t.category_id === income)).toBe(true);
  expect(await getBudgetMonth(ctx, "2026-08", "CHF")).toMatchObject({
    ready_to_assign_minor: 85500,
  });
  expect(await getBudgetMonth(ctx, "2026-08", "EUR")).toMatchObject({
    ready_to_assign_minor: 5950,
  });
  await createTransactions(ctx, {
    account_id: account,
    date: "2026-08-07",
    amount_minor: -250,
    category_id: food,
    transfer_account_id: off,
  });
  expect(await getBudgetMonth(ctx, "2026-08", "CHF")).toMatchObject({
    activity_this_month_minor: -1250,
    available_total_minor: -2750,
    uncategorized_count: 1,
  });
  await createTransactions(ctx, {
    account_id: off,
    date: "2026-08-08",
    amount_minor: -150,
    transfer_account_id: second,
    transfer_category_id: income,
  });
  expect(await getBudgetMonth(ctx, "2026-08", "CHF")).toMatchObject({
    ready_to_assign_minor: 85650,
  });
  await updateTransaction(ctx, cross.created[0]!.id, {
    amount_minor: -2000,
    transfer_amount_minor: 1800,
  });
  expect(await getTransaction(ctx, cross.created[1]!.id)).toMatchObject({ amount_minor: 1800 });
  await deleteTransaction(ctx, cross.created[1]!.id);
  await expect(getTransaction(ctx, cross.created[0]!.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await getBudgetMonth(ctx, "2026-08", "CHF")).toMatchObject({
    ready_to_assign_minor: 86650,
  });
  const balances = await listAccounts(ctx);
  expect(balances.find((a) => a.id === account)?.balance_minor).toBe(84650);
});
it("rejects invalid transfers and idempotently skips external IDs with no duplicate audit write", async () => {
  for (const tx of [
    { account_id: account, amount_minor: -100, transfer_account_id: off },
    { account_id: account, amount_minor: -100, transfer_account_id: eur },
    {
      account_id: account,
      amount_minor: -100,
      transfer_account_id: eur,
      transfer_amount_minor: -90,
    },
    { account_id: account, amount_minor: -100, transfer_account_id: second, category_id: food },
    { account_id: off, amount_minor: -100, category_id: food },
  ])
    await expect(createTransactions(ctx, { ...tx, date: "2026-08-10" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  const input = {
    account_id: account,
    date: "2026-08-10",
    amount_minor: -10,
    category_id: food,
    external_id: "idempotent",
  };
  await createTransactions(ctx, input);
  const n = fixture.sqlite.prepare("SELECT count(*) n FROM audit_events").get()?.n;
  expect((await createTransactions(ctx, input)).skipped).toHaveLength(1);
  expect(fixture.sqlite.prepare("SELECT count(*) n FROM audit_events").get()?.n).toBe(n);
});
it("moves assignments without changing RTA, merges category deletion by month/currency and paginates without duplicate rows", async () => {
  const before = await getBudgetMonth(ctx, "2026-08", "CHF");
  await moveMoney(ctx, "2026-08", {
    currency: "CHF",
    from_category_id: food,
    to_category_id: other,
    amount_minor: 200,
  });
  expect((await getBudgetMonth(ctx, "2026-08", "CHF")).ready_to_assign_minor).toBe(
    before.ready_to_assign_minor,
  );
  expect(
    fixture.sqlite
      .prepare(
        "SELECT count(*) n FROM audit_events e JOIN budget_assignments a ON e.entity_id=a.id WHERE e.action='move'",
      )
      .get()?.n,
  ).toBe(1);
  await expect(deleteCategory(ctx, food)).rejects.toMatchObject({ code: "CATEGORY_IN_USE" });
  await deleteCategory(ctx, food, other);
  const after = await getBudgetMonth(ctx, "2026-08", "CHF");
  expect(after.ready_to_assign_minor).toBe(before.ready_to_assign_minor);
  expect(after.available_total_minor).toBe(before.available_total_minor);
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listTransactions(ctx, { limit: 2, cursor });
    ids.push(...page.transactions.map((t) => t.id));
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  expect(new Set(ids).size).toBe(ids.length);
  expect(fixture.sqlite.prepare("SELECT count(*) n FROM transactions").get()?.n).toBe(ids.length);
  expect(
    fixture.sqlite
      .prepare(
        "SELECT count(*) n FROM audit_events WHERE actor_type='api_key' AND actor_id='key-1'",
      )
      .get()?.n,
  ).toBeGreaterThan(10);
});
it("imports 500 items with one SQL parameter set, skips duplicates and rolls back invalid batches", async () => {
  const { transactionBodySchema } = await import("../shared/schemas");
  const before = fixture.sqlite.prepare("SELECT count(*) n FROM transactions").get()?.n as number;
  const items = Array.from({ length: 500 }, (_, i) => ({
    account_id: account,
    date: "2026-08-12",
    amount_minor: -1,
    category_id: other,
    external_id: "bulk-" + i,
  }));
  const batch = transactionBodySchema.parse({ transactions: items });
  const result = await createTransactions(ctx, batch);
  expect(result.created).toHaveLength(500);
  expect((await createTransactions(ctx, batch)).skipped).toHaveLength(500);
  expect(fixture.sqlite.prepare("SELECT count(*) n FROM transactions").get()?.n).toBe(before + 500);
  await expect(
    createTransactions(ctx, {
      transactions: [
        { account_id: account, date: "2026-08-15", amount_minor: 1 },
        { account_id: "missing", date: "2026-08-15", amount_minor: 1 },
      ],
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(fixture.sqlite.prepare("SELECT count(*) n FROM transactions").get()?.n).toBe(before + 500);
  expect(transactionBodySchema.safeParse({ transactions: [...items, items[0]] }).success).toBe(
    false,
  );
});
it("does not expose other owners' accounts, categories or transactions", async () => {
  const outsider: AuthContext = { ...ctx, id: "outsider" };
  expect(await listAccounts(outsider, true)).toEqual([]);
  expect((await listTransactions(outsider, {})).transactions).toEqual([]);
  await expect(
    getTransaction(
      outsider,
      fixture.sqlite.prepare("SELECT id FROM transactions LIMIT 1").get()!.id as string,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    assignToCategory(outsider, "2026-08", other, { currency: "CHF", amount_minor: 100 }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("rolls back a domain write if its audit event cannot be recorded", async () => {
  const before = fixture.sqlite.prepare("SELECT count(*) n FROM transactions").get()?.n;
  fixture.sqlite.exec(
    "CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
  );
  try {
    await expect(
      createTransactions(ctx, { account_id: account, date: "2026-08-17", amount_minor: 1 }),
    ).rejects.toThrow();
  } finally {
    fixture.sqlite.exec("DROP TRIGGER reject_audit");
  }
  expect(fixture.sqlite.prepare("SELECT count(*) n FROM transactions").get()?.n).toBe(before);
});
