import { beforeEach, afterEach, expect, it, vi } from "vite-plus/test";
vi.mock("void/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("void/db")>();
  const holder = { db: undefined as typeof original.db | undefined };
  return {
    ...original,
    db: new Proxy({}, { get: (_target, key) => Reflect.get(holder.db!, key) }),
    testHolder: holder,
  };
});
import * as dbModule from "void/db";
import { testDatabase } from "./database";
import type { AuthContext } from "../shared/auth";
import type { ShareInput, TransactionCreate } from "../shared/schemas";
import { getSettings, updateSettings, incomeCategory } from "../server/settings";
import { createAccount, getAccount } from "../server/accounts";
import {
  createGroup,
  createCategory,
  deleteCategory,
  updateCategory,
  listCategories,
} from "../server/categories";
import {
  createTransactions,
  getTransaction,
  listTransactions,
  updateTransaction,
  deleteTransaction,
} from "../server/transactions";
import {
  splitAmounts,
  listIncomingShares,
  updateIncomingShare,
  getIncomingShare,
  listShareContacts,
} from "../server/shares";
import { getBudgetMonth, getCategoryMonth, assignToCategory } from "../server/budget";
import {
  createInvitation,
  revokeInvitation,
  inviteStatus,
  listInvitations,
} from "../server/invitations";
import { signupInvitation, hashInviteToken } from "../server/invite-token";
import { listMembers } from "../server/members";

const owner: AuthContext = {
  id: "owner",
  name: "Owner",
  email: "owner@example.com",
  role: "admin",
  via: "session",
};
let anna: AuthContext, bob: AuthContext;
let fixture: ReturnType<typeof testDatabase>,
  bank: string,
  food: string,
  annaFood: string,
  repayment: string;
const equal: ShareInput = { split_method: "equal", participants: [{ email: "ANNA@example.com" }] };
async function join(email: string, name: string) {
  const invitation = await createInvitation(owner, { email });
  const id = await signupInvitation(invitation.token, email);
  fixture.sqlite
    .prepare(
      "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)",
    )
    .run(id, name, email);
  const ctx: AuthContext = { id, email, name, role: "member", via: "session" };
  await getSettings(ctx);
  return ctx;
}
async function create(patch: Partial<TransactionCreate> = {}) {
  return (
    await createTransactions(owner, {
      account_id: bank,
      date: "2026-10-05",
      amount_minor: -201,
      category_id: food,
      share: equal,
      ...patch,
    })
  ).created[0]!;
}
beforeEach(async () => {
  fixture = testDatabase();
  (dbModule as unknown as { testHolder: { db: typeof dbModule.db } }).testHolder.db = fixture.db;
  fixture.sqlite.exec(
    `INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES ('owner','Owner','owner@example.com',0,0,0)`,
  );
  await getSettings(owner);
  anna = await join("anna@example.com", "Anna");
  bob = await join("bob@example.com", "Bob");
  bank = (await createAccount(owner, { name: "Bank", currency: "CHF", type: "checking" })).id;
  food = (
    await createCategory(owner, {
      name: "Food",
      group_id: (await createGroup(owner, { name: "Everyday" })).id,
    })
  ).id;
  annaFood = (
    await createCategory(anna, {
      name: "Food",
      group_id: (await createGroup(anna, { name: "Everyday" })).id,
    })
  ).id;
  repayment = (await listCategories(owner)).find((c) => c.kind === "repayment")!.id;
});
afterEach(() => fixture?.sqlite.close());

it("splits signed integers exactly, truncating toward zero and leaving remainders with owner", () => {
  for (const sign of [-1, 1]) {
    expect(
      splitAmounts(sign * 101, {
        split_method: "equal",
        participants: [{ email: "a@b.com" }, { email: "c@d.com" }],
      }),
    ).toEqual([sign * 33, sign * 33]);
    expect(
      splitAmounts(sign * 101, {
        split_method: "percent",
        participants: [
          { email: "a@b.com", percent_bp: 3333 },
          { email: "c@d.com", percent_bp: 6667 },
        ],
      }),
    ).toEqual([sign * 33, sign * 67]);
    expect(
      splitAmounts(sign * 101, {
        split_method: "amount",
        participants: [{ email: "a@b.com", amount_minor: sign * 101 }],
      }),
    ).toEqual([sign * 101]);
    expect(
      splitAmounts(sign * Number.MAX_SAFE_INTEGER, {
        split_method: "percent",
        participants: [{ email: "a@b.com", percent_bp: 9999 }],
      }),
    ).toEqual([Number((BigInt(sign) * BigInt(Number.MAX_SAFE_INTEGER) * 9999n) / 10000n)]);
  }
  for (const input of [
    {
      split_method: "percent",
      participants: [
        { email: "a@b.com", percent_bp: 6000 },
        { email: "c@d.com", percent_bp: 6000 },
      ],
    },
    { split_method: "amount", participants: [{ email: "a@b.com", amount_minor: 1 }] },
    { split_method: "amount", participants: [{ email: "a@b.com", amount_minor: -102 }] },
    { split_method: "equal", participants: [{ email: "a@b.com", percent_bp: 5000 }] },
    { split_method: "percent", participants: [{ email: "a@b.com", percent_bp: 1 }] },
  ] as ShareInput[])
    expect(() => splitAmounts(-101, input)).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  expect(() => splitAmounts(-1, equal)).toThrow(
    expect.objectContaining({ code: "VALIDATION_FAILED" }),
  );
});

it("budgets count each person's part, decline/accept changes both budgets, balances stay full", async () => {
  const tx = await create();
  expect(tx).toMatchObject({
    split_method: "equal",
    shared_out_minor: -100,
    own_amount_minor: -101,
  });
  const incoming = (await listIncomingShares(anna, {})).shares[0]!;
  expect(incoming).toMatchObject({
    total_minor: -201,
    amount_minor: -100,
    category_id: null,
    owner: { user_id: owner.id, name: owner.name, email: owner.email },
  });
  expect(await getBudgetMonth(owner, "2026-10")).toMatchObject({
    activity_this_month_minor: -101,
    available_total_minor: -101,
    uncategorized_count: 0,
    uncategorized_shares_count: 0,
  });
  expect(await getBudgetMonth(anna, "2026-10")).toMatchObject({
    activity_this_month_minor: 0,
    uncategorized_count: 1,
    uncategorized_shares_count: 1,
  });
  await updateIncomingShare(anna, incoming.id, { category_id: annaFood });
  expect(await getBudgetMonth(anna, "2026-10")).toMatchObject({
    activity_this_month_minor: -100,
    available_total_minor: -100,
    uncategorized_count: 0,
  });
  expect((await getCategoryMonth(anna, "2026-10", annaFood)).shares).toHaveLength(1);
  expect(await getCategoryMonth(anna, "2026-11", annaFood)).toMatchObject({
    available_minor: -100,
    spent_last_month_minor: 100,
    average_spent_3m_minor: 33,
  });
  await updateIncomingShare(anna, incoming.id, { status: "declined" });
  expect(await getBudgetMonth(anna, "2026-10")).toMatchObject({
    activity_this_month_minor: 0,
    available_total_minor: 0,
  });
  expect(await getBudgetMonth(owner, "2026-10")).toMatchObject({ activity_this_month_minor: -201 });
  expect((await getTransaction(owner, tx.id)).share?.participants[0]?.status).toBe("declined");
  await updateIncomingShare(anna, incoming.id, { status: "active" });
  expect((await getTransaction(owner, tx.id)).shared_out_minor).toBe(-100);
  expect((await getAccount(owner, bank)).balance_minor).toBe(-201);
  expect((await listTransactions(anna, {})).transactions).toEqual([]);
  const annaIncome = (await incomeCategory(anna)).id;
  await updateIncomingShare(anna, incoming.id, { category_id: annaIncome });
  expect(await getBudgetMonth(anna, "2026-10")).toMatchObject({
    ready_to_assign_minor: -100,
    income_this_month_minor: -100,
    activity_this_month_minor: 0,
  });
  const events = fixture.sqlite
    .prepare("SELECT user_id,action,payload FROM audit_events WHERE entity='transaction_share'")
    .all();
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ user_id: anna.id, action: "share_received" }),
      expect.objectContaining({ user_id: owner.id, action: "share_declined" }),
    ]),
  );
  expect(events.find((e) => e.action === "share_received")?.payload).toContain(owner.email);
});

it("repayment is immutable and absent from every budget figure", async () => {
  await create({ share: undefined, category_id: repayment, amount_minor: 1234 });
  await create({ share: undefined, category_id: repayment, amount_minor: -321 });
  expect(await getBudgetMonth(owner, "2026-10")).toMatchObject({
    ready_to_assign_minor: 0,
    income_this_month_minor: 0,
    activity_this_month_minor: 0,
    available_total_minor: 0,
    uncategorized_count: 0,
  });
  expect((await getAccount(owner, bank)).balance_minor).toBe(913);
  await expect(updateCategory(owner, repayment, { name: "Rename" })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await expect(deleteCategory(owner, repayment)).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    assignToCategory(owner, "2026-10", repayment, { currency: "CHF", amount_minor: 1 }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(create({ category_id: repayment })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  const tx = await create();
  await expect(updateTransaction(owner, tx.id, { category_id: repayment })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  await updateTransaction(owner, tx.id, { category_id: repayment, share: null });
  expect((await listIncomingShares(anna, {})).shares).toEqual([]);
  expect((await getBudgetMonth(owner, "2026-10")).activity_this_month_minor).toBe(0);
});

it("owner edits synchronize shares, preserve participant categories and declines, replacement reactivates", async () => {
  const tx = await create({
    share: {
      split_method: "percent",
      participants: [
        { email: anna.email, percent_bp: 3333 },
        { email: bob.email, percent_bp: 3333 },
      ],
    },
  });
  const id = (await listIncomingShares(anna, {})).shares[0]!.id;
  await updateIncomingShare(anna, id, { category_id: annaFood, status: "declined" });
  const edited = await updateTransaction(owner, tx.id, {
    amount_minor: -1001,
    date: "2026-11-02",
    payee: "New payee",
    memo: "New memo",
  });
  expect(edited.shared_out_minor).toBe(-333);
  expect(await getIncomingShare(anna, id)).toMatchObject({
    amount_minor: -333,
    total_minor: -1001,
    date: "2026-11-02",
    payee: "New payee",
    memo: "New memo",
    category_id: annaFood,
    status: "declined",
  });
  const replaced = await updateTransaction(owner, tx.id, { share: equal });
  expect(replaced).toMatchObject({ shared_out_minor: -500, own_amount_minor: -501 });
  expect(await getIncomingShare(anna, id)).toMatchObject({
    category_id: annaFood,
    status: "active",
  });
  expect((await listIncomingShares(bob, {})).shares).toHaveLength(0);
  expect(
    fixture.sqlite
      .prepare("SELECT action FROM audit_events WHERE user_id=? AND action='share_removed'")
      .get(bob.id)?.action,
  ).toBe("share_removed");
  await deleteTransaction(owner, tx.id);
  expect((await listIncomingShares(anna, {})).shares).toHaveLength(0);
  expect(await listShareContacts(anna)).toEqual([
    { user_id: owner.id, name: owner.name, email: owner.email },
  ]);
  expect(
    (await listShareContacts(owner)).map((u) => u.user_id).sort((a, b) => a.localeCompare(b)),
  ).toEqual([anna.id, bob.id].sort((a, b) => a.localeCompare(b)));
});

it("amount shares must keep fitting, sharing can be removed when turning into a transfer", async () => {
  const tx = await create({
    share: { split_method: "amount", participants: [{ email: anna.email, amount_minor: -200 }] },
  });
  await expect(updateTransaction(owner, tx.id, { amount_minor: -100 })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  expect((await getTransaction(owner, tx.id)).amount_minor).toBe(-201);
  const second = (await createAccount(owner, { name: "Second", type: "cash", currency: "CHF" })).id;
  await expect(
    updateTransaction(owner, tx.id, { transfer_account_id: second, category_id: null }),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  const transfer = await updateTransaction(owner, tx.id, {
    transfer_account_id: second,
    category_id: null,
    share: null,
  });
  expect(transfer).toMatchObject({
    share: null,
    split_method: null,
    shared_out_minor: 0,
    transfer_account_id: second,
  });
  expect((await getTransaction(owner, transfer.transfer_transaction_id!)).amount_minor).toBe(201);
  expect((await listIncomingShares(anna, {})).shares).toHaveLength(0);
});

it("shares enable recipient currencies and category deletion moves shares", async () => {
  await updateSettings(owner, { enabled_currencies: ["CHF", "EUR"] });
  const euro = (await createAccount(owner, { name: "Euro", type: "checking", currency: "EUR" })).id;
  await create({ account_id: euro });
  expect((await getSettings(anna)).enabled_currencies).toEqual(["CHF", "EUR"]);
  const incoming = (await listIncomingShares(anna, {})).shares[0]!;
  await updateIncomingShare(anna, incoming.id, { category_id: annaFood });
  const other = (
    await createCategory(anna, {
      name: "Other",
      group_id: (await createGroup(anna, { name: "Other" })).id,
    })
  ).id;
  await expect(deleteCategory(anna, annaFood)).rejects.toMatchObject({ code: "CATEGORY_IN_USE" });
  await deleteCategory(anna, annaFood, other);
  expect((await getIncomingShare(anna, incoming.id)).category_id).toBe(other);
  expect(await getBudgetMonth(anna, "2026-10", "EUR")).toMatchObject({
    activity_this_month_minor: -100,
  });
});

it("private transactions, budgets and shares stay scoped; contacts only reveal share relationships", async () => {
  expect(await listShareContacts(owner)).toEqual([]);
  const tx = await create();
  const incoming = (await listIncomingShares(anna, {})).shares[0]!;
  for (const ctx of [anna, bob]) {
    await expect(getTransaction(ctx, tx.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateTransaction(ctx, tx.id, { payee: "Hacked" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteTransaction(ctx, tx.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getCategoryMonth(ctx, "2026-10", food)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }
  for (const ctx of [owner, bob]) {
    await expect(getIncomingShare(ctx, incoming.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateIncomingShare(ctx, incoming.id, { status: "declined" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await expect(updateIncomingShare(anna, incoming.id, { category_id: food })).rejects.toMatchObject(
    { code: "NOT_FOUND" },
  );
  const annaRepayment = (await listCategories(anna)).find((c) => c.kind === "repayment")!.id;
  await expect(
    updateIncomingShare(anna, incoming.id, { category_id: annaRepayment }),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  expect(await listShareContacts(owner)).toEqual([
    { user_id: anna.id, name: anna.name, email: anna.email },
  ]);
  expect(await listShareContacts(anna)).toEqual([
    { user_id: owner.id, name: owner.name, email: owner.email },
  ]);
  expect(await listShareContacts(bob)).toEqual([]);
  for (const participants of [
    [{ email: owner.email }],
    [{ email: anna.email }, { email: anna.email.toUpperCase() }],
  ])
    await expect(create({ share: { split_method: "equal", participants } })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  await expect(
    create({ share: { split_method: "equal", participants: [{ email: "missing@example.com" }] } }),
  ).rejects.toMatchObject({ code: "SHARE_RECIPIENT_NOT_FOUND" });
  const off = (
    await createAccount(owner, { name: "Off", type: "other", currency: "CHF", on_budget: false })
  ).id;
  await expect(create({ account_id: off, category_id: null })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
});

it("share changes and notifications roll back with their transaction when audit fails", async () => {
  const tx = await create();
  const before = fixture.sqlite.prepare("SELECT * FROM transaction_shares ORDER BY id").all();
  fixture.sqlite.exec(
    `CREATE TRIGGER reject_share_audit BEFORE INSERT ON audit_events WHEN NEW.action='share_updated' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`,
  );
  await expect(
    updateTransaction(owner, tx.id, { amount_minor: -501, payee: "Fail" }),
  ).rejects.toThrow();
  expect(fixture.sqlite.prepare("SELECT * FROM transaction_shares ORDER BY id").all()).toEqual(
    before,
  );
  expect(await getTransaction(owner, tx.id)).toMatchObject({
    amount_minor: -201,
    shared_out_minor: -100,
    payee: "",
  });
});

it("invitation lifecycle hashes tokens, binds email, expires and consumes exactly once", async () => {
  const created = await createInvitation(
    owner,
    { email: "NEW@example.com" },
    "https://example.com",
  );
  expect(created.url).toBe(`https://example.com/join?token=${created.token}`);
  const row = fixture.sqlite
    .prepare("SELECT * FROM invitations WHERE id=?")
    .get(created.invitation.id)!;
  expect(row.token_hash).toBe(await hashInviteToken(created.token));
  expect(JSON.stringify(row)).not.toContain(created.token);
  expect(
    new Date(created.invitation.expires_at).getTime() -
      new Date(created.invitation.created_at).getTime(),
  ).toBe(7 * 86400000);
  expect(await inviteStatus(created.token)).toEqual({
    valid: true,
    email: "new@example.com",
    invited_by_name: "Owner",
  });
  await expect(signupInvitation(created.token, "wrong@example.com")).rejects.toMatchObject({
    body: { code: "INVITE_EMAIL_MISMATCH" },
  });
  expect(await signupInvitation(created.token, "NEW@example.com")).toBe(created.invitation.id);
  fixture.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)",
    )
    .run(created.invitation.id, "New", "new@example.com");
  expect((await listInvitations(owner)).find((i) => i.id === created.invitation.id)).toMatchObject({
    status: "used",
    used_by: created.invitation.id,
  });
  await expect(signupInvitation(created.token, "new@example.com")).rejects.toMatchObject({
    body: { code: "INVITE_INVALID" },
  });
  const revoked = await createInvitation(owner, {});
  await revokeInvitation(owner, revoked.invitation.id);
  expect((await listInvitations(owner)).find((i) => i.id === revoked.invitation.id)?.status).toBe(
    "revoked",
  );
  const expired = await createInvitation(owner, {});
  fixture.sqlite
    .prepare("UPDATE invitations SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?")
    .run(expired.invitation.id);
  expect((await listInvitations(owner)).find((i) => i.id === expired.invitation.id)?.status).toBe(
    "expired",
  );
  for (const token of [created.token, revoked.token, expired.token, "unknown"]) {
    expect(await inviteStatus(token)).toEqual({ valid: false, email: null, invited_by_name: null });
    await expect(signupInvitation(token, "new@example.com")).rejects.toMatchObject({
      body: { code: "INVITE_INVALID" },
    });
  }
  await expect(signupInvitation(null, "new@example.com")).rejects.toMatchObject({
    body: { code: "SIGN_UP_CLOSED" },
  });
  expect((await listMembers(owner)).filter((m) => m.role === "admin")).toHaveLength(1);
  for (const action of [
    () => listMembers(anna),
    () => listInvitations(anna),
    () => createInvitation(anna, {}),
    () => revokeInvitation(anna, created.invitation.id),
  ])
    await expect(async () => action()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(fixture.sqlite.prepare("SELECT count(*) n FROM user").get()?.n).toBe(4);
});

it("supports ten participants, owner zero, positive shared income and incoming pagination", async () => {
  const people = [anna, bob];
  for (let i = 0; i < 8; i++) people.push(await join(`member${i}@example.com`, `Member ${i}`));
  const tx = await create({
    amount_minor: -1001,
    share: { split_method: "equal", participants: people.map((p) => ({ email: p.email })) },
  });
  expect(tx).toMatchObject({ own_amount_minor: -91, shared_out_minor: -910 });
  expect(tx.share?.participants).toHaveLength(10);
  const ownIncome = (await incomeCategory(owner)).id;
  const incomingIncome = (await incomeCategory(anna)).id;
  const positive = await create({
    date: "2026-10-06",
    amount_minor: 101,
    category_id: ownIncome,
    share: { split_method: "percent", participants: [{ email: anna.email, percent_bp: 10000 }] },
  });
  expect(positive).toMatchObject({ own_amount_minor: 0, shared_out_minor: 101 });
  const shares = await listIncomingShares(anna, { limit: 1 });
  expect(shares.shares).toHaveLength(1);
  expect(shares.next_cursor).not.toBeNull();
  const next = await listIncomingShares(anna, { limit: 1, cursor: shares.next_cursor! });
  expect(next.shares).toHaveLength(1);
  expect(next.shares[0]!.id).not.toBe(shares.shares[0]!.id);
  expect(next.next_cursor).toBeNull();
  await updateIncomingShare(anna, shares.shares[0]!.id, { category_id: incomingIncome });
  expect(await getBudgetMonth(anna, "2026-10")).toMatchObject({
    ready_to_assign_minor: 101,
    income_this_month_minor: 101,
  });
  expect(await getBudgetMonth(owner, "2026-10")).toMatchObject({
    ready_to_assign_minor: 0,
    income_this_month_minor: 0,
  });
});

it("initializes a new participant's settings in the same atomic batch as the share", async () => {
  fixture.sqlite.prepare("DELETE FROM audit_events WHERE user_id=?").run(bob.id);
  fixture.sqlite.prepare("DELETE FROM settings WHERE user_id=?").run(bob.id);
  fixture.sqlite.prepare("DELETE FROM categories WHERE user_id=?").run(bob.id);
  fixture.sqlite.exec(
    `CREATE TRIGGER reject_received BEFORE INSERT ON audit_events WHEN NEW.action='share_received' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`,
  );
  await expect(
    create({ share: { split_method: "equal", participants: [{ email: bob.email }] } }),
  ).rejects.toThrow();
  expect(fixture.sqlite.prepare("SELECT count(*) n FROM transactions").get()?.n).toBe(0);
  expect(
    fixture.sqlite.prepare("SELECT count(*) n FROM settings WHERE user_id=?").get(bob.id)?.n,
  ).toBe(0);
  expect(
    fixture.sqlite.prepare("SELECT count(*) n FROM categories WHERE user_id=?").get(bob.id)?.n,
  ).toBe(0);
});

it("owner edits retain participant choices made after the owner's initial read", async () => {
  const tx = await create();
  const incoming = (await listIncomingShares(anna, {})).shares[0]!;
  const original = fixture.db;
  const holder = (dbModule as unknown as { testHolder: { db: typeof dbModule.db } }).testHolder;
  holder.db = new Proxy(original, {
    get(target, key) {
      if (key === "batch")
        return async (statements: Parameters<typeof original.batch>[0]) => {
          holder.db = original;
          await updateIncomingShare(anna, incoming.id, {
            category_id: annaFood,
            status: "declined",
          });
          return original.batch(statements);
        };
      return Reflect.get(target, key);
    },
  });
  await updateTransaction(owner, tx.id, { amount_minor: -401, payee: "Edited" });
  expect(await getIncomingShare(anna, incoming.id)).toMatchObject({
    category_id: annaFood,
    status: "declined",
    amount_minor: -200,
    payee: "Edited",
  });
  expect(await getTransaction(owner, tx.id)).toMatchObject({
    shared_out_minor: 0,
    own_amount_minor: -401,
  });
});
