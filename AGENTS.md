<!--injected-by-void-v1.1.11-->

## Void

- This project uses [Void](https://void.cloud), a full-stack Vite framework for Cloudflare Workers with file-based API routing, server-rendered pages, and typed backend services.
- Use Void's CLI and typed APIs. Before working with Void, read the relevant Markdown docs in `node_modules/void/docs/`; start with `guide/quickstart.md` for setup and `reference/cli.md` for commands.

<!--/injected-by-void-->

## Project

- Before changing this foundation, read `docs/ARCHITECTURE.md`, the binding architecture spec.
- Use `vp install`, `vp dev`, `vp check`, `vp test`, and `vp build`. Run `vp run check` to also check Vue templates with `vue-tsc`.
- REST and MCP contain no business logic; they call `server/`.
- Keep the Vue SPA in `src/` and API routes in `routes/`; designers own styling and UI components.
