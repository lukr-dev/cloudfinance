# cloudfinance — Architecture (Phase 1)

Single-user, zero-based budgeting app that runs entirely on Cloudflare (free tier where possible).
Agents are first-class users: everything the UI can do, an agent can do via REST or MCP.

## Stack

| Concern | Choice |
| --- | --- |
| Toolchain | **Vite+** (`vp` — dev / check / test / build), pnpm |
| Deployment & backend | **Void SDK** (`void` package) → Cloudflare Workers on the user's personal CF account (`void deploy`) |
| App shape | Void **"SPA + API"**: Vue 3 SPA in `src/`, Void API routes in `routes/` |
| Database | Cloudflare **D1** via `void/db` (SQLite locally) |
| Auth | **Better Auth** via Void (`void/auth`, mounted at `/api/auth/*`) |
| Frontend | Vue 3 (`<script setup lang="ts">`), Vue Router, Pinia, vue-i18n (de + en) |
| Validation | zod schemas in `shared/`, used by API routes, MCP tools and the frontend |
| Agent access | REST `/api/v1/*` + MCP server at `/mcp` (spec **2026-07-28**, stateless) |

Free-tier notes: Workers free plan = ~10 ms CPU per request. Keep request handlers cheap
(no heavy parsing, no large in-memory aggregation). Budget math is done in SQL.

## Auth

- Email + password **and** passkeys (Better Auth passkey plugin).
- **Sign-up is closed once one user exists.** First visit with an empty user table shows a
  one-time "create your account" screen; afterwards sign-up endpoints reject.
- Initial account creation requires `X-Setup-Token` matching the production `SETUP_TOKEN`
  secret (constant-time digest comparison). A missing secret fails closed with
  `SETUP_TOKEN_REQUIRED`; a missing/wrong header returns `SETUP_TOKEN_INVALID` (403).
  Only loopback request origins (`localhost`, `127.0.0.1`, `[::1]`) without a configured
  token may create the initial account without a header. Once a user exists,
  `SIGN_UP_CLOSED` takes precedence. Public setup status returns `needsSetup` and
  `setupTokenRequired`; it never reveals the token.
- **API keys** (Better Auth API-key plugin) for agents. Created/revoked in Settings; the
  plaintext key is shown once. Sent as `Authorization: Bearer <key>`.
- Every `/api/v1/*` and `/mcp` request must resolve to the user, either from the session cookie
  or from an API key. Anything else → 401.
- A valid API key at its rate limit returns 429 with code `RATE_LIMITED` and a
  `Retry-After` header in seconds (MCP puts the code in JSON-RPC `error.data.code`).
  REST and MCP share the key's quota: 120 accepted requests, resetting after a
  60-second gap since the last accepted request in the installed Better Auth plugin.
  Clients should wait for `Retry-After` and reuse the same key; invalid or revoked keys remain 401.
- All domain rows carry `user_id` and every query is scoped by it. Single-user today, but we
  don't want a painful migration if that changes.

## Money

- Amounts are **integers in minor units** (`amount_minor`), signed: negative = outflow,
  positive = inflow. Never floats.
- Currency is an ISO 4217 code. Minor-unit exponent comes from a static table in `shared/`
  (CHF/EUR/USD/GBP = 2, JPY = 0, …).
- **Base currency** (default `CHF`) and the list of **enabled currencies** are user settings.
- **No FX conversion.** Every figure is computed and shown per currency.

## Domain model (zero-based, per currency)

Each currency is its own independent budget ledger. Categories are shared across currencies;
assignments are per `(month, category, currency)`.

Tables (all with `id` as text ULID/UUID, `user_id`, `created_at`, `updated_at`):

- **settings** — one row per user: `base_currency`, `enabled_currencies` (JSON array),
  `locale` (`de` | `en`), `theme` (`light` | `dark` | `system`).
- **accounts** — `name`, `type` (`checking` | `savings` | `credit_card` | `cash` | `investment` |
  `other`), `currency`, `on_budget` (bool), `institution` (nullable text, e.g. `revolut`,
  `postfinance`, for future connectors), `closed_at` (nullable), `sort_order`.
- **category_groups** — `name`, `sort_order`, `hidden`.
- **categories** — `group_id`, `name`, `sort_order`, `hidden`, `note`, `color` (one of the
  palette tokens `teal | orange | pink | indigo | violet | amber | red | green | blue | slate`;
  on create, default to the next token in round-robin order).
  One **system category** per user: `kind = 'income'` ("Ready to Assign" inflow). It cannot be
  deleted or renamed and does not appear in the budget table. User categories have `kind = 'expense'`.
- **budget_assignments** — `month` (`YYYY-MM`), `category_id`, `currency`, `amount_minor`.
  Unique `(user_id, month, category_id, currency)`.
- **transactions** — `account_id`, `date` (`YYYY-MM-DD`), `amount_minor`, `currency`
  (= account currency, denormalised), `payee` (text), `memo`, `category_id` (nullable),
  `cleared` (`uncleared` | `cleared` | `reconciled`), `transfer_account_id` and
  `transfer_transaction_id` (nullable, paired), `source` (`manual` | `api` | `mcp` | `import:<name>`),
  `external_id` (nullable; unique per `(user_id, account_id, external_id)` for idempotent import).
- **audit_events** — `at`, `actor_type` (`user` | `api_key`), `actor_id`, `action`, `entity`,
  `entity_id`, `payload` (JSON). Every write through REST or MCP is logged, so agent changes
  stay traceable.

Splits, rules, payee entities, targets and connectors are **Phase 2**. Don't build them, and
don't shape the schema in ways that block them.

### Budget math (per currency `c`, month `m`)

Only transactions in **on-budget** accounts count.

- `activity(cat, m, c)` = Σ `amount_minor` of transactions in `cat`, month `m`, currency `c`.
- `assigned(cat, m, c)` = the assignment row, or 0.
- `available(cat, m, c)` = Σ over all months ≤ `m` of (`assigned` + `activity`).
  **Full rollover, including negatives**: overspending stays in the category until it is covered.
- `ready_to_assign(c)` = Σ inflows categorised as the income system category (all time, currency `c`)
  − Σ all assignments in currency `c` (**all months, including future ones**).
  It is a single current value per currency, shown on every month.
- Month summary also returns: `income_this_month`, `assigned_this_month`,
  `activity_this_month`, `available_total`.

### Transfers

- A transfer creates **two linked transactions** (one per account) with opposite signs, in a single
  operation. Editing or deleting one side updates or deletes the other.
- On-budget ↔ on-budget, **same currency** → both sides have `category_id = NULL` (budget-neutral).
- On-budget ↔ on-budget, **different currencies** → amounts differ per side (caller supplies both).
  Each side is categorised; the default is the income system category on both sides (money leaves
  one currency's Ready to Assign and enters the other's).
- On-budget ↔ off-budget → the on-budget side needs a category; the off-budget side has none.

### Validation rules

- An on-budget, non-transfer transaction with `category_id = NULL` is **uncategorised**. That is allowed,
  but it is counted and surfaced in the UI and API (`uncategorized_count`).
- An off-budget account's transactions never have a category.
- A transaction's `currency` always equals its account's currency.
- A category with transactions or assignments can't be deleted unless the request names a target to move them to (`reassign_to`).
- An account with transactions can't be deleted, only closed.

## Code layout

```
shared/            zod schemas, DTO types, currency table, money helpers (pure, no I/O)
server/            domain services (pure functions over the DB): accounts, categories,
                   budget, transactions, settings, audit. Single source of business logic.
routes/            Void API routes: thin, validate → call server/ → JSON
routes/api/v1/...  REST API
routes/mcp.ts      MCP endpoint (thin adapter over server/)
src/               Vue SPA (design system, views, stores, i18n)
src/api/           typed client for /api/v1
docs/              this file, API notes
```

REST and MCP **must not** contain business logic. Both call `server/`.

## REST API (`/api/v1`)

JSON in and out; amounts in minor units; errors are `{ error: { code, message, details? } }` with the proper HTTP status.

- `GET/PATCH /settings`
- `GET/POST /accounts`, `GET/PATCH/DELETE /accounts/:id` (balances included: `balance_minor`,
  `cleared_balance_minor`, `uncleared_balance_minor`)
- `GET/POST /category-groups`, `PATCH/DELETE /category-groups/:id`
- `GET/POST /categories`, `PATCH/DELETE /categories/:id` (`DELETE ?reassign_to=`)
- `GET /budget/:month?currency=CHF` → month summary + groups → categories with assigned, activity and available
- `PUT /budget/:month/assignments/:categoryId` `{ currency, amount_minor }`
- `POST /budget/:month/move` `{ currency, from_category_id, to_category_id, amount_minor }`
- `GET /transactions?account_id&category_id&from&to&q&uncategorized&cursor&limit`
- `POST /transactions` — one transaction or `{ transactions: [...] }` (batch ≤ 500, idempotent on
  `external_id`, response says which were created or skipped). Transfers via `transfer_account_id`
  (+ `transfer_amount_minor` for cross-currency).
- `GET/PATCH/DELETE /transactions/:id`
- `GET /payees?q=` — distinct payee names (autocomplete)
- `GET /audit-events?cursor&limit`
- `GET /openapi.json` — machine-readable spec for agents

## MCP (`/mcp`)

- Spec **2026-07-28** (stateless; no session handshake). Official TypeScript SDK
  (`@modelcontextprotocol/server`) and, if it fits Void, Cloudflare `agents` `createMcpHandler`.
- Only **2026-07-28** is supported, over POST. Legacy requests receive the
  unsupported-protocol-version error and must upgrade. GET and DELETE are not supported.
- Tool results: `structuredContent` is always a JSON object (lists are wrapped as `{ items }`)
  and is mirrored as JSON text for clients that only read `content`.
- Auth: the same API key as REST, `Authorization: Bearer <key>`. OAuth is Phase 2.
- Tools mirror the REST surface (read + write): settings, accounts, categories, budget month,
  assign, move money, list/create/update/delete transactions. Tool descriptions document the
  sign convention and minor units clearly, because agents will get this wrong otherwise.

## i18n

- vue-i18n with `de` and `en`. Locale comes from user settings, falling back to the browser.
- Numbers, currency and dates are formatted with `Intl` for the active locale
  (de-CH style for `de` with CHF: `CHF 1’234.50`).
- API error `code`s are stable identifiers; the UI translates them.

## Phase 2 (not now)

Revolut (personal) via a third-party open-banking connector, PostFinance PDF statement parser,
CSV import, rules, splits, insights/cash flow/forecast/habits, in-app AI, OAuth for MCP.
