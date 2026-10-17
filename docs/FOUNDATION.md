# Foundation verification — 2026-10-17

The minimal foundation is implemented. `docs/ARCHITECTURE.md` was not edited.
No domain tables, MCP tools, UI forms, styling, commits, pushes, deployments, or Cloudflare login were added/performed.
`docs/design/` belongs to the separate designer and is excluded from foundation formatting.

## Versions actually installed

- Global `vp`: 1.3.0; local `vite-plus`: 1.3.0.
- Void: 1.1.11 (pinned).
- Vue: 3.5.44; Vue Router: 5.4.0; Pinia: 4.1.0; vue-i18n: 11.4.14; zod: 4.6.7.
- Better Auth, `@better-auth/passkey`, `@better-auth/api-key`: 1.7.10.
- Managed Node: 24.22.0; pnpm: 12.14.0; TypeScript: 6.0.3; vue-tsc: 3.3.13.
- Vite+ reports Vite 8.3.4, Vitest 5.0.5, Oxlint 1.88.0, Oxfmt 0.73.0.
- `/usr/local/bin/node --version` still prints `v24.19.0`.

## Setup commands executed

```sh
vp --version
vp --help
vp env --help
vp env current
curl -fsSL https://vite.plus | bash -s -- --help
# The installer did not implement --help: it installed Vite+ 1.3.0 successfully.
vp env pin 24.22.0 --target node-version
pnpm init
vp env pin pnpm@12.14.0
pnpm add -D void vite-plus
# Configure pnpm-workspace.yaml allowBuilds for esbuild/workerd and disable better-sqlite3.
pnpm install
pnpm void --help
pnpm void init --help
pnpm void init --no-git
# Existing project, D1, AGENTS.md yes, demo no, skip deployment setup.
pnpm add vue vue-router pinia vue-i18n zod better-auth @better-auth/passkey @better-auth/api-key
pnpm add -D @vitejs/plugin-vue typescript vue-tsc @types/node
pnpm add -D vite@npm:@voidzero-dev/vite-plus-core@1.3.0
pnpm add hono
pnpm approve void -y
mkdir -p .agents .claude
pnpm void init --tsconfig --no-git
pnpm add -D typescript@~6.0.2
vp install
pnpm void db generate
pnpm void gen migration single_user
# Fill the custom migration with the single-user unique index.
pnpm void db migrate
```

`void init` created its managed AGENTS.md block and agent skills. Skill links were
normalized to `../../node_modules/void/skills/...` so changing pnpm peer resolution
does not break them. `CLAUDE.md` contains exactly `@AGENTS.md`.

## Verification commands and actual output

```text
$ vp install
Already up to date
Done in 4ms using pnpm v12.14.0

$ vp check
pass: All 34 files are correctly formatted (2445ms, 8 threads)
pass: Found no warnings, lint errors, or type errors in 26 files (2.7s, 8 threads)

$ vp run check
$ vp check
... no format, lint or type errors ...
$ vue-tsc --noEmit
vp run: 2/2 successful.

$ vp test
Test Files  3 passed (3)
     Tests  5 passed (5)
Duration  13.42s

$ vp build
1138 modules transformed (Worker)
built in 880ms
225 modules transformed (SPA)
built in 273ms

$ vp dev --port 5187 --strictPort
VITE+ v1.3.0 ready in 12396 ms
Local: http://127.0.0.1:5187/

$ pnpm void db generate
6 tables
No schema changes, nothing to migrate
Migration generation complete.

$ pnpm void db reset --yes
Database reset. Applied 2 migrations.

$ pnpm void db execute 'SELECT count(*) AS users FROM "user"'
users
0
SQL executed successfully.
```

`vp check` always invokes Vite+'s built-in checker, even though a package script has
the same name. `vp run check` additionally checks Vue templates. Tests cover exact
integer money parsing/formatting, executing the checked-in auth migrations and rejecting
a second database user, and real HTTP requests against an isolated local Void/D1 server.
The HTTP test also checks key revocation, invalid Bearer precedence over cookies,
session-only key creation, passkey endpoint registration, SPA history fallback and no-store headers.

### Curl walkthrough

The following script was executed as `bash /tmp/cloudfinance-verify-auth.sh` against
`vp dev --port 5187 --strictPort`. It prints no password/session/key material.
The temporary response files and cookie jar are removed on exit.

```sh
#!/usr/bin/env bash
set -euo pipefail
base=http://localhost:5187
scratch=$(mktemp -d /tmp/cloudfinance-curl.XXXXXX)
trap 'rm -rf "$scratch"' EXIT
payload='{"email":"foundation@example.com","password":"foundation-test-password-123","name":"Foundation"}'
curl -fsS "$base/api/v1/setup-status"
printf '\n'
status=$(curl -sS -o "$scratch/signup.json" -w '%{http_code}' -H 'Content-Type: application/json' -H "Origin: $base" -d "$payload" "$base/api/auth/sign-up/email")
test "$status" = 200
printf 'first signup: %s\n' "$status"
status=$(curl -sS -o "$scratch/second.json" -w '%{http_code}' -H 'Content-Type: application/json' -H "Origin: $base" -d '{"email":"second@example.com","password":"foundation-test-password-123","name":"Second"}' "$base/api/auth/sign-up/email")
test "$status" = 403
printf 'second signup: %s ' "$status"
cat "$scratch/second.json"
printf '\n'
curl -fsS -o "$scratch/signin.json" -c "$scratch/cookies" -H 'Content-Type: application/json' -H "Origin: $base" -d "$payload" "$base/api/auth/sign-in/email"
printf 'session me: '
curl -fsS -b "$scratch/cookies" "$base/api/v1/me"
printf '\n'
curl -fsS -o "$scratch/key.json" -b "$scratch/cookies" -H 'Content-Type: application/json' -H "Origin: $base" -d '{"name":"curl-verification"}' "$base/api/auth/api-key/create"
key=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["key"])' "$scratch/key.json")
printf 'API-key me: '
curl -fsS -H "Authorization: Bearer $key" "$base/api/v1/me"
printf '\n'
status=$(curl -sS -o "$scratch/anonymous.json" -w '%{http_code}' "$base/api/v1/me")
test "$status" = 401
printf 'no credentials: %s ' "$status"
cat "$scratch/anonymous.json"
printf '\n'
curl -fsS "$base/api/v1/setup-status"
printf '\n'
curl -fsS -o "$scratch/index.html" "$base/"
python3 -c 'import sys; assert "<div id=\"app\">" in open(sys.argv[1]).read(); print("SPA index: HTTP 200, app mount and module entry present")' "$scratch/index.html"
```

Actual output:

```text
{"needsSetup":true}
first signup: 200
second signup: 403 {"code":"SIGN_UP_CLOSED","message":"Account setup is complete. Sign-up is closed."}
session me: {"id":"rdTN02T04uC4ATU7LcoptMUGjXDBlj0n","email":"foundation@example.com","name":"Foundation","via":"session"}
API-key me: {"id":"rdTN02T04uC4ATU7LcoptMUGjXDBlj0n","email":"foundation@example.com","name":"Foundation","via":"api_key"}
no credentials: 401 {"error":{"code":"UNAUTHORIZED","message":"Authentication required."}}
{"needsSetup":false}
SPA index: HTTP 200, app mount and module entry present
```

Both the password sign-in and API-key creation curl requests completed with HTTP 200
(`curl -f` succeeded). The account was removed by stopping dev and running
`pnpm void db reset --yes`. The final preview returns `{"needsSetup":true}`.

## Migration and passkey configuration

See [README.md](../README.md#database-and-migrations) for the exact migration workflow:
`pnpm void db generate`, review SQL and metadata, `pnpm void db migrate` locally,
and `pnpm void deploy --platform cloudflare` later to provision/apply remotely.
`pnpm void gen migration name` creates custom migrations. Auth/plugin schemas are inferred
from `auth.ts`, not duplicated in the empty `db/schema.ts`.

Passkey RP ID defaults to the request hostname; origin defaults to the request origin.
For local development that is `localhost` and `http://localhost:5173`. For the tailnet
preview it is `hermes.tail880baf.ts.net` and `https://hermes.tail880baf.ts.net:8509`.
For production use the deployed HTTPS origin and hostname, fixed via `AUTH_ORIGIN` and
`PASSKEY_RP_ID` in Void server secrets. Local overrides go in `.env` only. The RP ID
excludes scheme and port; the origin includes both. Credentials are bound to the RP ID.

## Tailnet preview

[Open the foundation](https://hermes.tail880baf.ts.net:8509/).

Current Tailscale host: `hermes.tail880baf.ts.net` / `100.66.1.104`. Existing Serve routes
were preserved; HTTPS port 8509 was unused. Two detached local processes keep the preview
available: Vite/Voids API at loopback port 5187 and Python's static server, rooted only at
`dist/client`, at loopback port 5188. Only `/api` is proxied to Void, so development explorer
and repository files are not exposed. The compiled assets are the latest `vp build` output.

Commands used for the Serve handlers:

```sh
# API server environment:
# AUTH_ORIGIN=https://hermes.tail880baf.ts.net:8509
# PASSKEY_RP_ID=hermes.tail880baf.ts.net
# vp dev --port 5187 --strictPort
# Static server:
# python3 -m http.server 5188 --bind 127.0.0.1 --directory "$PWD/dist/client"
tailscale serve --bg --https=8509 http://127.0.0.1:5188
tailscale serve --bg --https=8509 --set-path=/api http://127.0.0.1:5187/api
tailscale serve --bg --https=8509 --set-path=/setup http://127.0.0.1:5188/index.html
tailscale serve --bg --https=8509 --set-path=/login http://127.0.0.1:5188/index.html
```

PIDs are recorded in `/tmp/cloudfinance-foundation-{dev,assets}.pid`; logs are in the
corresponding `.log` files. Rebuild with `vp build` after changing SPA source to refresh
the served files. Run `tailscale serve --https=8509 off` to remove this preview only.
Tailscale's direct filesystem serving required unavailable sudo privileges, so loopback
HTTP serving was used instead.

Verified through the HTTPS Tailscale URL: `/`, `/setup`, main and lazy setup JS assets,
and `/api/v1/setup-status` returned 200. `auth.ts` and the local debug API returned 404.
The collaborative browser redirected `/` to `/setup`, displayed `Einmalig ein Konto erstellen`,
and reported no console errors or failed network requests.

## SDK differences and remaining limits

- No binding architecture changes were necessary. Public setup status is the explicitly
  requested bootstrap exception to the architecture's authenticated API rule.
- Void 1.1.11 exposes no public Better Auth instance getter. Server-only key verification
  uses `c.get('__voidAuth')` inside the shared helper; this is version-pinned and integration-tested.
- D1 is the implicit default; `database: 'd1'` is rejected. Only `pg`/`mysql` are explicit values.
- Void's env validation rejects `.env.example`, not just unsupported dotenv loading; examples
  live in the README instead.
- vue-tsc 3.3.13 fails on TypeScript 7's removed `typescript/lib/tsc` export. TypeScript 6.0.3
  works. Vite+'s own Go-based type checker also passes.
- Vite+ 1.3.0 provides Vitest through `vite-plus/test`; the obsolete `vite-plus-test` alias
  was not installed. pnpm reports peer metadata mismatches for the Vite+ core alias's version
  and Void's development dependencies expecting Vitest 4 while Vite+ bundles Vitest 5.
  These did not prevent installation, checks, tests, or the build.
- Real authenticator registration/sign-in, production CPU limits, Cloudflare provisioning,
  and deployment have not been exercised. Passkey client/server plugins, table generation,
  and the authenticated list endpoint are validated.
- Setup and login are intentional plain-text placeholders. No domain services or MCP endpoint
  are implemented in this foundation task.

## File tree

Source files and installed-skill links; excludes node_modules, .git, ignored build/runtime
state, and pnpm's duplicate generated skill aliases. `docs/design/` is owned by the designer.
Generated `.void/`, `.void-wrangler.jsonc`, and `dist/` also exist and are gitignored.

```text
cloudfinance/
├── .agents/
│   └── skills/
│       ├── migrate-vite-cloudflare-to-void -> ../../node_modules/void/skills/migrate-vite-cloudflare-to-void
│       ├── void -> ../../node_modules/void/skills/void
│       └── .gitignore
├── .claude/
│   └── skills/
│       ├── migrate-vite-cloudflare-to-void -> ../../node_modules/void/skills/migrate-vite-cloudflare-to-void
│       ├── void -> ../../node_modules/void/skills/void
│       └── .gitignore
├── db/
│   ├── migrations/
│   │   ├── meta/
│   │   │   ├── 20261017210618_snapshot.json
│   │   │   ├── 20261017210628_snapshot.json
│   │   │   └── _journal.json
│   │   ├── 20261017210618_high_dagger.sql
│   │   └── 20261017210628_single_user.sql
│   └── schema.ts
├── docs/
│   ├── design/
│   │   ├── mockup-budget.html
│   │   └── tokens.css
│   ├── ARCHITECTURE.md
│   └── FOUNDATION.md
├── routes/
│   └── api/
│       └── v1/
│           ├── me.ts
│           └── setup-status.ts
├── server/
│   ├── auth-context.ts
│   ├── index.ts
│   └── setup.ts
├── shared/
│   ├── auth.ts
│   ├── index.ts
│   ├── money.test.ts
│   └── money.ts
├── src/
│   ├── api/
│   │   ├── auth.ts
│   │   └── index.ts
│   ├── i18n/
│   │   └── index.ts
│   ├── router/
│   │   └── index.ts
│   ├── views/
│   │   ├── HomeView.vue
│   │   ├── LoginView.vue
│   │   └── SetupView.vue
│   ├── App.vue
│   ├── env.d.ts
│   └── main.ts
├── tests/
│   ├── auth.integration.test.ts
│   └── migrations.test.ts
├── .gitignore
├── .node-version
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── auth.ts
├── env.ts
├── index.html
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
├── vite.config.ts
└── void.config.ts
```
