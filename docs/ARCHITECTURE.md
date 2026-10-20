# cloudfinance — Architecture (Phase 1)

Zero-based budgeting app for a small household, running entirely on Cloudflare (free tier where possible).
Each user has a private budget; users on the same instance can share individual entries (see *Members and shared entries*).
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
- **Sign-up is invite-only once one user exists** (see *Members and invitations*). First visit with an empty user table shows a
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
  REST and MCP share the key's quota: 600 accepted requests, resetting after a
  60-second gap since the last accepted request in the installed Better Auth plugin.
  Clients should wait for `Retry-After` and reuse the same key; invalid or revoked keys remain 401.
- All domain rows carry `user_id` and every query is scoped by it. A user never reads another
  user's accounts, categories, budget, transactions or audit log. The only cross-user data is
  a shared entry (see below), plus the admin's member list.

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

Rules, payee entities, targets and connectors are **Phase 2**. Don't build them, and
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

## Members and invitations

- The first user is the instance **admin**. Every later user joins through an invitation.
- **members** — `user_id` (PK, FK `user`, cascade), `role` (`admin` | `member`), `invited_by`
  (nullable user id), `joined_at`. The migration backfills the existing user as `admin`.
  Exactly one admin.
- **invitations** — `id`, `created_by`, `email` (nullable; when set, only that email may join),
  `token_hash` (SHA-256 hex of the token; the plaintext is never stored), `expires_at`
  (created + 7 days), `used_at`, `used_by`, `revoked_at`, `created_at`.
- Only the admin creates, lists and revokes invitations. Creating one returns the plaintext token
  and the join URL `/join?token=…` exactly once. No email is sent: the admin copies the link.
- Sign-up (`user.create.before`): with no users, the existing setup-token rule applies. Otherwise
  the request must carry `X-Invite-Token` with an unexpired, unused, unrevoked invitation (and a
  matching email when the invitation names one), else `SIGN_UP_CLOSED` (403), `INVITE_INVALID`
  (403, unknown/expired/used/revoked) or `INVITE_EMAIL_MISMATCH` (403). After the user is created,
  the invitation is marked used and a `members` row (`member`) is inserted.
- The public `GET /api/v1/invite-status?token=` returns `{ valid, email, invited_by_name }`
  (no auth; reveals nothing for invalid tokens beyond `valid: false`).
- `GET /me` includes `role`.
- Removing members is not in scope yet.

## Members and shared entries

A user (the **owner**) can share one of their transactions with other users on the same instance,
addressed by **email**. The owner records the full amount as it hit their bank account and
decides how it is split. **Each person's budget counts only their own part.** There is no debt
tracking, "owed" balance or settle-up: nobody sees another user's balances.

Example: Lukas pays CHF 200 insurance from his checking account and shares it 50/50 with Anna.
- Lukas: checking shows −200 (balances use the full amount). His Insurance category activity is −100.
- Anna: a CHF −100 **incoming share** appears in her budget right away, uncategorised, until she
  picks one of her own categories. It belongs to no account and does not change her balances.
- If Anna pays Lukas back, both of them categorise that real transfer as **Shared repayment**
  (see below), so it doesn't touch either budget again.

### Data

- **transactions** gains `shared_out_minor` (integer, default 0): the sum of the *active*
  participants' shares, same sign as `amount_minor` (or 0), `|shared_out_minor| ≤ |amount_minor|`.
  The owner's **own part** is `amount_minor − shared_out_minor`.
- **transaction_shares** — one row per participant; `user_id` is the **participant**, so the
  participant's queries stay scoped by `user_id`. Columns: `id`, `user_id`, `created_at`,
  `updated_at`, `transaction_id` (owner's transaction, cascade delete), `owner_user_id`,
  `amount_minor` (participant's part, same sign as the transaction, nonzero), `percent_bp`
  (basis points, set only for `percent`), `currency`, `date`, `payee`, `memo` (copied from the
  owner's transaction and kept in sync), `category_id` (participant's own category, nullable;
  FK `(user_id, category_id)`), `status` (`active` | `declined`). Unique
  `(transaction_id, user_id)`.
- The owner's transaction stores `split_method` (`equal` | `percent` | `amount`, nullable when not
  shared).
- New system category per user: `kind = 'repayment'` ("Shared repayment"), no group, created like
  the income category, cannot be renamed or deleted, never in the budget table. Transactions in
  it count in balances but in no budget figure (not activity, not Ready to Assign, not
  uncategorised).

### Splitting rules

- Shareable: non-transfer transactions in **on-budget** accounts with `amount_minor ≠ 0`.
  Transfers, off-budget transactions and transactions in the repayment category can't be shared.
- Participants are addressed by email (case-insensitive) and must be users of this instance
  (`SHARE_RECIPIENT_NOT_FOUND`, 404). Not yourself, no duplicates (`VALIDATION_FAILED`). Max 10.
- `equal`: total split over participants + owner; each participant gets the total divided by
  (n + 1), truncated toward zero; the remainder stays with the owner.
- `percent`: each participant gives `percent_bp` (1–10000); the sum ≤ 10000; each share is
  truncated toward zero; the remainder stays with the owner.
- `amount`: each participant gives `amount_minor` with the transaction's sign, nonzero;
  `|Σ| ≤ |amount_minor|`.
- The owner's own part may be 0 (they paid entirely for someone else).
- Changing the owner's amount recomputes `equal`/`percent` shares; for `amount` it must still
  fit, else `VALIDATION_FAILED`. Date/payee/memo changes propagate to the share rows. Turning a
  shared transaction into a transfer, or its category into repayment, fails unless the share is
  removed in the same request.
- Replacing the participant list keeps the participant's `category_id` for people who stay and
  resets their `status` to `active`. Removed participants' rows are deleted.
- Deleting the owner's transaction deletes its shares.
- When a share lands in a currency the participant hasn't enabled, it is added to their
  `enabled_currencies`.

### Participant actions

- Set `category_id` (own expense or income category, or `null`).
- `status: 'declined'` removes the share from their budget; the owner's `shared_out_minor` drops
  accordingly and the owner sees it as declined. `status: 'active'` re-accepts it.
- A participant can't change amounts, dates or payees.

### Budget math with shares

- Category activity, available, `activity_this_month`, `available_total` and Ready to Assign use
  `amount_minor − shared_out_minor` for the user's own transactions **plus** the user's active
  incoming shares (by `date`, `currency`, `category_id`). Shares categorised as income count
  toward Ready to Assign. Account balances keep using `amount_minor`.
- `uncategorized_count` also counts active incoming shares without a category.
  `GET /budget/:month` adds `uncategorized_shares_count`.
- Category month (`GET /budget/:month/categories/:id`) adds `shares`: the user's active incoming
  shares in that category and month.
- Deleting a category with `reassign_to` also moves the user's share rows.

### Audit

Every share write is logged in the actor's audit log. Creating, changing or removing a share also
writes an event in each affected participant's log (`action` `share_received` | `share_updated`
| `share_removed`, `entity` `transaction_share`, payload with the owner's name and email), and a
participant's decline writes `share_declined` into the owner's log.

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
- Transactions carry `split_method`, `shared_out_minor`, `own_amount_minor` and `share`
  (`null`, or `{ split_method, participants: [{ share_id, user_id, name, email, amount_minor,
  percent_bp, status }] }` — only on the owner's view).
  `POST /transactions` (single, not batch items with transfers) and `PATCH /transactions/:id`
  accept `share: { split_method, participants: [{ email, percent_bp? | amount_minor? }] }`;
  `PATCH` also accepts `share: null` to stop sharing.
- `GET /shares?status=active|declined&uncategorized=true&from&to&cursor&limit` — the user's
  incoming shares, newest first: `{ shares: [{ id, transaction_id, owner: { user_id, name, email },
  date, payee, memo, currency, total_minor, amount_minor, split_method, percent_bp,
  category_id, category_name, category_color, status }], next_cursor }`.
- `PATCH /shares/:id` `{ category_id?, status? }`
- `GET /share-contacts` — users you have shared with or received shares from:
  `[{ user_id, name, email }]` (for email autocomplete; no full member directory).
- Admin only (`FORBIDDEN`, 403 otherwise): `GET /members`
  (`[{ user_id, name, email, role, joined_at }]`), `GET/POST /invitations`
  (`POST { email? }` → `{ invitation, token, url }`), `DELETE /invitations/:id` (revoke).
- Public: `GET /invite-status?token=`.
- `GET /openapi.json` — machine-readable spec for agents

## MCP (`/mcp`)

- Spec **2026-07-28** (stateless; no session handshake). Official TypeScript SDK
  (`@modelcontextprotocol/server`) and, if it fits Void, Cloudflare `agents` `createMcpHandler`.
- Only **2026-07-28** is supported, over POST. Legacy requests receive the
  unsupported-protocol-version error and must upgrade. GET and DELETE are not supported.
- Tool results: `structuredContent` is always a JSON object (lists are wrapped as `{ items }`)
  and is mirrored as JSON text for clients that only read `content`.
- Auth: the same API key as REST, `Authorization: Bearer <key>`. OAuth is Phase 2.
- Tools also cover sharing: the `share` field on create/update transaction, list/update incoming
  shares, list share contacts; admins can list members and create/revoke invitations.
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
