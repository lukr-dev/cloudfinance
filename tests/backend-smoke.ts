import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { currencyExponents, parseMoney } from "../shared/money";
import type {
  Account,
  Category,
  CategoryGroup,
  Settings,
  StarterResult,
  TransactionResult,
  TransactionList,
  BudgetMonth,
  CategoryMonth,
  AuditList,
  ApiError,
} from "../shared/schemas";

export async function backendSmoke(
  base: string,
  key: string,
  keyId: string,
  cookie: string,
  log: (message: string) => void = () => {},
) {
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    status = 200,
  ): Promise<T> {
    const response = await fetch(base + "/api/v1" + path, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(
        `${method} ${path}: HTTP ${response.status}, expected JSON, got ${text.slice(0, 100)}`,
      );
    }
    assert.equal(response.status, status, JSON.stringify(result));
    return result as T;
  }
  assert.equal((await fetch(base + "/api/v1/accounts")).status, 401);
  const unauthMcp = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(unauthMcp.status, 401);
  assert.equal(unauthMcp.headers.get("WWW-Authenticate"), "Bearer");
  const cookieMcp = await fetch(base + "/mcp", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(cookieMcp.status, 401, await cookieMcp.text());
  assert.equal(
    (await fetch(base + "/mcp", { headers: { Authorization: `Bearer ${key}` } })).status,
    405,
  );
  assert.equal(
    (await fetch(base + "/mcp", { method: "DELETE", headers: { Authorization: `Bearer ${key}` } }))
      .status,
    405,
  );
  assert.equal((await request<Settings>("/settings")).base_currency, "CHF");
  await request("/settings", "PATCH", { enabled_currencies: ["CHF", "EUR"], locale: "en" });
  const starter = await request<StarterResult>("/setup/starter-categories", "POST");
  assert.equal(starter.created, true);
  assert.equal(starter.categories.filter((c) => c.kind === "expense").length, 17);
  assert.equal((await request<StarterResult>("/setup/starter-categories", "POST")).created, false);
  const income = starter.categories.find((c) => c.kind === "income")!.id;
  const food = starter.categories.find((c) => c.name === "Groceries")!.id;
  const other = starter.categories.find((c) => c.name === "Transport")!.id;
  const account = await request<Account>("/accounts", "POST", {
    name: "Smoke Bank",
    type: "checking",
    currency: "CHF",
  });
  const second = await request<Account>("/accounts", "POST", {
    name: "Wallet",
    type: "cash",
    currency: "CHF",
  });
  const euro = await request<Account>("/accounts", "POST", {
    name: "Euro",
    type: "checking",
    currency: "EUR",
  });
  const tracking = await request<Account>("/accounts", "POST", {
    name: "Tracking",
    type: "investment",
    currency: "CHF",
    on_budget: false,
  });
  assert.equal(
    (
      await request<ApiError>(
        "/accounts",
        "POST",
        { name: "USD", type: "checking", currency: "USD" },
        400,
      )
    ).error.code,
    "CURRENCY_NOT_ENABLED",
  );
  assert.equal(
    (
      await request<ApiError>(
        "/accounts",
        "POST",
        { name: "Bad", type: "checking", currency: "ZZZ" },
        400,
      )
    ).error.code,
    "VALIDATION_FAILED",
  );
  assert.equal(
    (await request<ApiError>("/categories/" + income, "PATCH", { name: "Rename" }, 409)).error.code,
    "CONFLICT",
  );
  const created = await request<TransactionResult>("/transactions", "POST", {
    transactions: [
      {
        account_id: account.id,
        date: "2026-07-25",
        amount_minor: 100000,
        category_id: income,
        cleared: "cleared",
      },
      {
        account_id: account.id,
        date: "2026-07-26",
        amount_minor: -12000,
        category_id: food,
        payee: "Migros",
      },
      {
        account_id: account.id,
        date: "2026-08-01",
        amount_minor: -1000,
        category_id: food,
        payee: "Coop",
        external_id: "smoke-import",
      },
      { account_id: account.id, date: "2026-08-02", amount_minor: -100, payee: "Kiosk" },
      { account_id: tracking.id, date: "2026-08-02", amount_minor: 900000 },
      { account_id: euro.id, date: "2026-08-02", amount_minor: 5000, category_id: income },
      {
        account_id: account.id,
        date: "2026-08-05",
        amount_minor: -2000,
        transfer_account_id: second.id,
      },
      {
        account_id: account.id,
        date: "2026-08-06",
        amount_minor: -1000,
        transfer_account_id: euro.id,
        transfer_amount_minor: 950,
      },
      {
        account_id: account.id,
        date: "2026-08-07",
        amount_minor: -250,
        transfer_account_id: tracking.id,
        category_id: food,
      },
    ],
  });
  assert.equal(created.created.length, 12);
  assert.equal(
    (
      await request<TransactionResult>("/transactions", "POST", {
        account_id: account.id,
        date: "2026-08-01",
        amount_minor: -1000,
        category_id: food,
        external_id: "smoke-import",
      })
    ).skipped.length,
    1,
  );
  for (const [month, amount_minor] of [
    ["2026-07", 10000],
    ["2026-08", 500],
    ["2027-01", 3000],
  ] as const)
    await request(`/budget/${month}/assignments/${food}`, "PUT", { currency: "CHF", amount_minor });
  const expected = {
    ready_to_assign_minor: 85500,
    income_this_month_minor: -1000,
    assigned_this_month_minor: 500,
    activity_this_month_minor: -1250,
    available_total_minor: -2750,
    uncategorized_count: 1,
  };
  const month = await request<BudgetMonth>("/budget/2026-08?currency=CHF");
  for (const [name, value] of Object.entries(expected))
    assert.equal(month[name as keyof BudgetMonth], value, name);
  assert.equal(
    (await request<BudgetMonth>("/budget/2026-08?currency=EUR")).ready_to_assign_minor,
    5950,
  );
  const inspector = await request<CategoryMonth>(`/budget/2026-08/categories/${food}?currency=CHF`);
  assert.equal(inspector.carried_over_minor, -2000);
  assert.equal(inspector.average_spent_3m_minor, 4000);
  assert.equal(inspector.transactions.length, 2);
  const balances = await request<Account[]>("/accounts");
  assert.equal(balances.find((a) => a.id === account.id)!.balance_minor, 83650);
  assert.equal(balances.find((a) => a.id === account.id)!.cleared_balance_minor, 100000);
  const page = await request<TransactionList>("/transactions?limit=2");
  assert.equal(page.transactions.length, 2);
  assert.equal(page.uncategorized_count, 1);
  const next = await request<TransactionList>(
    "/transactions?limit=2&cursor=" + encodeURIComponent(page.next_cursor!),
  );
  assert(!next.transactions.some((t) => page.transactions.some((p) => p.id === t.id)));
  assert.equal(
    (await request<TransactionList>("/transactions?uncategorized=true")).transactions.length,
    1,
  );
  assert((await request<string[]>("/payees?q=Mi")).includes("Migros"));
  assert.equal(
    (await request<ApiError>("/accounts/" + account.id, "DELETE", undefined, 409)).error.code,
    "ACCOUNT_HAS_TRANSACTIONS",
  );
  assert.equal(
    (await request<ApiError>("/categories/" + food, "DELETE", undefined, 409)).error.code,
    "CATEGORY_IN_USE",
  );
  assert.equal(
    (await request<ApiError>("/budget/2026-13?currency=CHF", "GET", undefined, 400)).error.code,
    "VALIDATION_FAILED",
  );
  assert.equal(
    (await request<ApiError>("/transactions?cursor=invalid", "GET", undefined, 400)).error.code,
    "VALIDATION_FAILED",
  );
  const spec = await request<{ openapi: string; paths: Record<string, unknown> }>("/openapi.json");
  assert.equal(spec.openapi, "3.1.0");
  assert("/api/v1/budget/{month}" in spec.paths);
  log(
    "REST smoke: 4 accounts, starter categories, 12 transaction legs, all three transfer kinds, assignments, balances, inspector, validation and pagination passed.",
  );
  log("REST budget CHF 2026-08: " + JSON.stringify(expected));
  const legacy = await fetch(base + "/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "legacy-smoke", version: "1.0.0" },
      },
    }),
  });
  assert.equal(legacy.status, 400);
  const rejectedLegacy = (await legacy.json()) as {
    id: number;
    error: { code: number; message: string; data: { supported: string[]; requested: string } };
  };
  assert.equal(rejectedLegacy.id, 1);
  assert.equal(rejectedLegacy.error.code, -32022);
  assert.match(rejectedLegacy.error.message, /Unsupported protocol version/);
  assert.deepEqual(rejectedLegacy.error.data, {
    supported: ["2026-07-28"],
    requested: "2025-11-25",
  });
  assert.equal(legacy.headers.get("Mcp-Session-Id"), null);
  log(
    "MCP legacy initialize: HTTP 400, unsupported-protocol-version (-32022); only 2026-07-28 supported.",
  );
  const wireRequests: string[] = [];
  const client = new Client(
    { name: "cloudfinance-smoke", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
    fetch: async (input, init) => {
      if (typeof init?.body === "string") wireRequests.push(init.body);
      const response = await fetch(input, init);
      assert.equal(response.headers.get("Mcp-Session-Id"), null);
      return response;
    },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 19);
    const budget = await client.callTool({
      name: "get_budget_month",
      arguments: { month: "2026-08", currency: "CHF" },
    });
    assert.equal((budget.structuredContent as BudgetMonth).ready_to_assign_minor, 85500);
    const written = await client.callTool({
      name: "create_transactions",
      arguments: {
        transactions: [
          {
            account_id: account.id,
            date: "2026-08-08",
            amount_minor: -50,
            category_id: food,
            external_id: "mcp-smoke",
            payee: "MCP smoke",
          },
        ],
      },
    });
    assert.equal(written.isError, undefined);
    assert.equal((written.structuredContent as TransactionResult).created[0]!.source, "mcp");
    const after = await client.callTool({
      name: "get_budget_month",
      arguments: { month: "2026-08", currency: "CHF" },
    });
    assert.equal((after.structuredContent as BudgetMonth).available_total_minor, -2800);
    assert(wireRequests.every((body) => !body.includes('"method":"initialize"')));
    assert(wireRequests.some((body) => body.includes("io.modelcontextprotocol/protocolVersion")));
    log(
      "MCP official client: server/discover, tools/list (19 tools), get_budget_month and create_transactions passed using 2026-07-28 _meta; no initialize or session ID.",
    );
  } finally {
    await client.close();
  }
  const audit = await request<AuditList>("/audit-events?limit=200");
  assert(
    audit.events.some(
      (e) =>
        e.actor_type === "api_key" &&
        e.actor_id === keyId &&
        e.action === "create" &&
        e.entity === "transaction" &&
        e.payload.source === "mcp",
    ),
  );
  log("Audit smoke: API-key actor ID matches the created key on REST and MCP writes.");
  // Exercise linked edits/deletes and category reassignment after the hand-computed snapshot.
  const transfer = created.created.find(
    (t) => t.account_id === account.id && t.transfer_account_id === second.id,
  )!;
  await request("/transactions/" + transfer.id, "PATCH", { amount_minor: -3000 });
  const counterpart = await request<TransactionList>("/transactions?account_id=" + second.id);
  assert.equal(counterpart.transactions[0]!.amount_minor, 3000);
  await request("/transactions/" + transfer.id, "DELETE");
  await request("/transactions/" + transfer.transfer_transaction_id, "GET", undefined, 404);
  await request("/budget/2026-08/move", "POST", {
    currency: "CHF",
    from_category_id: food,
    to_category_id: other,
    amount_minor: 200,
  });
  await request("/categories/" + food + "?reassign_to=" + other, "DELETE");
  assert.equal(
    (await request<BudgetMonth>("/budget/2026-08?currency=CHF")).ready_to_assign_minor,
    85500,
  );
  const disposableGroup = await request<CategoryGroup>("/category-groups", "POST", {
    name: "Disposable",
  });
  const disposable = await request<Category>("/categories", "POST", {
    name: "Disposable",
    group_id: disposableGroup.id,
  });
  await request("/categories/" + disposable.id, "PATCH", { note: "Smoke" });
  await request("/categories/" + disposable.id, "DELETE");
  await request("/category-groups/" + disposableGroup.id, "PATCH", { hidden: true });
  await request("/category-groups/" + disposableGroup.id, "DELETE");
  await request("/accounts/" + second.id, "PATCH", { closed_at: new Date().toISOString() });
  assert.equal((await request<Account[]>("/accounts")).length, 3);
  assert.equal((await request<Account[]>("/accounts?include_closed=true")).length, 4);
  assert.equal(
    (await request<ApiError>("/settings", "PATCH", { enabled_currencies: [] }, 400)).error.code,
    "VALIDATION_FAILED",
  );
  assert.equal(
    (await request<ApiError>("/settings", "PATCH", { enabled_currencies: ["CHF", "CHF"] }, 400))
      .error.code,
    "VALIDATION_FAILED",
  );
  assert.equal(
    (await request<ApiError>("/settings", "PATCH", { enabled_currencies: ["EUR"] }, 400)).error
      .code,
    "CURRENCY_NOT_ENABLED",
  );
  assert.equal(
    (await request<ApiError>("/settings", "PATCH", { base_currency: "KWD" }, 400)).error.code,
    "CURRENCY_NOT_ENABLED",
  );
  const enabled = Object.keys(currencyExponents);
  assert.deepEqual(
    (await request<Settings>("/settings", "PATCH", { enabled_currencies: enabled }))
      .enabled_currencies,
    enabled,
  );
  for (const [currency, amount] of [
    ["SEK", "12.34"],
    ["KWD", "-12.345"],
  ] as const) {
    const foreign = await request<Account>("/accounts", "POST", {
      name: currency,
      type: "checking",
      currency,
    });
    const amount_minor = parseMoney(amount, currency);
    const result = await request<TransactionResult>("/transactions", "POST", {
      account_id: foreign.id,
      currency,
      date: "2026-08-09",
      amount_minor,
      category_id: income,
    });
    assert.equal(result.created[0]!.amount_minor, amount_minor);
    const saved = await request<TransactionList>("/transactions?account_id=" + foreign.id);
    assert.equal(saved.transactions.length, 1);
    assert.equal(saved.transactions[0]!.currency, currency);
    assert.equal(saved.transactions[0]!.amount_minor, amount_minor);
    assert.equal((await request<Account>("/accounts/" + foreign.id)).balance_minor, amount_minor);
    await request(`/budget/2026-08/assignments/${other}`, "PUT", { currency, amount_minor: 1 });
    const budget = await request<BudgetMonth>("/budget/2026-08?currency=" + currency);
    assert.equal(budget.ready_to_assign_minor, amount_minor - 1);
    assert.equal(budget.assigned_this_month_minor, 1);
  }
  log(
    "REST currencies: all 155 enabled; SEK/KWD accounts, transaction minor units, balances and assignments round-trip; empty/duplicate lists and disabled base currencies rejected.",
  );
}
