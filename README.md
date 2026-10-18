# cloudfinance

Minimal Vue 3 SPA + Void API foundation for the budgeting architecture in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). No domain features or visual design yet.

## Develop

Install the global [Vite+ CLI](https://viteplus.dev/guide/global-cli), then let it manage
this project's Node 24.22.0 and pnpm 12.14.0. The system Node is left alone.

```sh
curl -fsSL https://vite.plus | bash
vp env install
vp install
vp dev
```

Open the URL Vite prints (normally `http://localhost:5173`). One server handles the SPA,
history fallback, REST, and `/api/auth/*`. `vp install` runs `void prepare` to generate
gitignored `.void` types; dev also applies local migrations. No Cloudflare login is needed.

For a local reverse proxy, allow its hostname explicitly in the shell (comma-separated,
without schemes or ports). The default only allows Vite's local hosts:

```sh
VITE_ALLOWED_HOSTS=hermes.tail880baf.ts.net vp dev
```

The three views contain plain translated text. Setup/sign-in forms and all styling are
left to the designer. Auth clients, passkey/API-key client plugins, and navigation guards
are wired in `src/api/auth.ts` and `src/router/index.ts`.

```sh
vp check         # format, lint and TypeScript checks
vp run check     # the above plus vue-tsc for Vue templates
vp test          # unit + real HTTP integration tests; no watch mode
vp build         # dist/client assets + dist/ssr Cloudflare Worker
```

`vp check` is a built-in command, so it does not execute the identically named package
script; use `vp run check` for the complete Vue check. TypeScript 6 is pinned because
this vue-tsc release cannot load TypeScript 7. Tests start their own `vp dev` on a free
port with temporary D1 persistence and delete that state afterwards.

## Authentication

`auth.ts` explicitly extends Void's Better Auth defaults with email/password, passkey,
and API-key plugins. The user-create hook rejects sign-up after the first user. A unique
SQLite expression index also prevents two concurrent initial sign-ups creating two users.
API keys stay hashed; the creation response returns the plaintext key once.

- Public `GET /api/v1/setup-status` returns `needsSetup` and `setupTokenRequired` booleans.
  Initial setup needs the `X-Setup-Token` header whenever `SETUP_TOKEN` is configured or
  the request URL is not loopback. A missing production secret rejects signup with
  `SETUP_TOKEN_REQUIRED`; missing/wrong headers return `SETUP_TOKEN_INVALID` (403).
  Loopback development without a token needs no header. An existing user always gives
  `SIGN_UP_CLOSED`, regardless of the token.
  This is the requested bootstrap exception to authenticated `/api/v1/*` routes.
- `GET /api/v1/me` calls `server/auth-context.ts` and returns `{ id, email, name, via }`.
- Session cookies give `via: "session"`. `Authorization: Bearer <key>` is verified with
  Better Auth's server-only `verifyApiKey` and gives `via: "api_key"`.
- An explicit invalid Authorization header fails with 401 even when a valid cookie exists.
  API keys do not become browser sessions or gain access to session-only auth management.
- API errors use `{ error: { code, message } }`; Better Auth's own endpoints retain its
  standard error format. Authenticated responses and setup status use `Cache-Control: no-store`.

Void 1.1.11 has no public getter for its Better Auth instance. The shared helper isolates
the internal `c.get('__voidAuth')` access; the integration test exercises that seam. Recheck
it on SDK upgrades. No alternate auth instance or duplicated password configuration exists.

During `vp dev`, passkey RP ID and auth origin always use the current request URL,
ignoring production vars. Loopback development normally uses `http://localhost:5173`
and `rpID=localhost`. A remote browser needs HTTPS and a proxy that preserves the
external request URL. Production `AUTH_ORIGIN` and `PASSKEY_RP_ID` are fixed in
`void.config.ts` under `cloudflare.vars`. These non-secret keys are deliberately absent
from `env.ts`: Void 1.1.11 rejects schema-declared server keys in plaintext Worker vars.
Changing the RP ID requires registering new passkeys. Void manages `BETTER_AUTH_SECRET`
on deployment; dev supplies its own default. A local production preview needs an explicit
`BETTER_AUTH_SECRET`. `SETUP_TOKEN` is a server secret declared in `env.ts`; never put it
in a `VITE_*` value, the repository, or workflow logs.

Void only supports a root `.env`: even `.env.example` is rejected when env.ts is present.
Examples therefore live here. `.env` is gitignored and never uploaded by Void.

## Database and migrations

D1 is Void's default database: omit `database` in `void.config.ts` (`"d1"` is not a valid
value; only external SQL dialects use that property). Local SQLite state is in `.void/`.
`db/schema.ts` is empty for now; future domain tables use `void/schema-d1` and `void/db`.

```sh
pnpm void db generate             # auth + plugin + application schema -> SQL and metadata
pnpm void gen migration name      # empty custom SQL migration, updates the journal
pnpm void db migrate              # apply pending migrations locally, preserving data
pnpm void db push                 # optional local prototyping without migration files
pnpm void db execute 'SELECT count(*) AS users FROM "user"'
pnpm void db reset --yes          # stop dev first; deletes LOCAL data, reapplies migrations
```

Review the generated SQL and `db/migrations/meta/` before the orchestrator commits them.
Void includes Better Auth and configured plugin tables automatically, so do not copy them
into `db/schema.ts` or run the Better Auth migration CLI. The checked-in migrations create
`user`, `session`, `account`, `verification`, `passkey`, and `apikey`, followed by the one-user
constraint. Dev applies pending local SQL and auth migrations; deploy applies migrations
to the remote D1 database. Keep `--> statement-breakpoint` markers for custom SQL.

The curl verification account was deleted with `pnpm void db reset --yes`; the next dev
run starts with `needsSetup: true`. Tests never seed the normal development database.

Money helpers store safe integer minor units and use the CHF/EUR/USD/GBP=2, JPY=0 table.
`parseMoney` accepts an ungrouped decimal in the supplied locale and rejects excess precision
instead of rounding. `formatMoney` uses Intl parts and integer arithmetic to retain cents.

## Deployment

Production is <https://cloudfinance.toastnet.work>, Worker `cloudfinance`, on the
**Lukas Rauscher** account (`7979b4f7816680c8ba9be80700d1abe4`) and its active
`toastnet.work` zone. The hostname is a Workers Custom Domain, so Cloudflare manages
its DNS and TLS. Remove a conflicting CNAME before the first deployment if one exists.

The first deployment runs in GitHub Actions (`void cloudflare login` needs a desktop
keyring, which headless machines lack). When `void.lock.json` is missing, the deploy
workflow provisions production, stores the `SETUP_TOKEN` repository secret as a Worker
secret, and uploads the generated lock as the `void-lock` artifact. Commit that file to
`dev` and merge it to `main` before the next deployment:

```sh
gh run download <run-id> --repo lukr-dev/cloudfinance --name void-lock
```

Void provisions D1, applies migrations and creates `BETTER_AUTH_SECRET`. The app rejects
public signup until `SETUP_TOKEN` is set, including the interval between deployment and
secret creation. Open `https://cloudfinance.toastnet.work/setup?token=<token>`, or enter
the token in setup, and create the owner's account. Confirm that setup status changes to
`needsSetup: false` and that further signup is closed. Keep the token private; the
GitHub secret can be deleted once the account exists.

The version-metadata binding lets Void verify the candidate version through
`https://cloudfinance.toastnet.work/__void/ready` during staged deployment. Both
`workers_dev` and `preview_urls` are disabled. No Workers subdomain CI variable is
needed. Initial custom-domain DNS/TLS propagation can delay readiness; check the
domain and retry from the same checkout if necessary, preserving `.void` recovery state.

Create a Cloudflare API token scoped to this account and the `toastnet.work` zone:

- Account: **Workers Scripts: Edit**, **D1: Edit**, **Account Settings: Read**.
- Zone (`toastnet.work` only): **Workers Routes: Edit**, **Zone: Read**.
- DNS: Edit is only needed if you also edit DNS records yourself; this configuration
  uses the Workers Custom Domain API, which manages its own DNS/TLS. No KV, R2,
  Hyperdrive, Queues, Containers, or email permissions are needed for this app.

These permissions follow the installed Void [Cloudflare CI guide](node_modules/void/docs/integrations/cloudflare.md#deploying-from-ci),
Cloudflare's [Worker/route permissions](https://developers.cloudflare.com/workers/authorization/workers/),
[Custom Domain API](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/),
and [zone lookup](https://developers.cloudflare.com/api/resources/zones/methods/list/).

In GitHub **Settings → Secrets and variables → Actions**, add repository secret
`CLOUDFLARE_API_TOKEN` and repository variable `CLOUDFLARE_ACCOUNT_ID` with value
`7979b4f7816680c8ba9be80700d1abe4`. Create/configure the `production` environment
(deployment URL above), allowing deployment from `main`; add approval rules if desired.
Add repository secret `SETUP_TOKEN` (a long random value) for the first deployment.

Work on `dev`, open a PR to `main`, then merge. Every branch push and every PR runs
`.github/workflows/ci.yml`; pushes to `main` deploy after the same checks pass.
Manual deployment uses `workflow_dispatch` on `main` only. Production deployments
are serialized and never cancel an in-progress deploy. Both workflows grant only
`contents: read`. CI uses the official [Vite+ setup and dependency cache](https://viteplus.dev/guide/ci.md),
Node from `.node-version`, and pnpm from `devEngines`/`packageManager`. Native build
permissions for `workerd` and `esbuild` are already enabled in `pnpm-workspace.yaml`.

The deploy step uses:

```sh
pnpm void deploy --platform cloudflare </dev/null
```

Void 1.1.11 has no `--yes` or `--ci` deploy option. GitHub sets `CI=true`; closed
stdin, explicit target/account, and the required API token make deployment non-interactive
and cause missing credentials/setup to fail instead of prompting. The workflow checks
credentials before invoking Void. Commit updated `void.lock.json` whenever provisioning
changes; do not commit generated Cloudflare config, `.void`, or local `.env`.

Hardware-backed passkey
registration and production Workers CPU usage remain to be checked in their real environments.
See [the foundation verification report](docs/FOUNDATION.md) for versions, commands, outputs,
the file tree, and the tailnet preview.
