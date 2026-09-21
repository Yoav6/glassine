# Glassine

Private, per-reviewer suggestion and comment review for markdown documents. Reviewers get a WYSIWYG document in suggestion mode; accepted edits splice into a hosted `.md` file. Licensed AGPL-3.0.

Full documentation lives in [`../documentation`](../documentation/README.md).

## Quick start (development)

Node 22.12+ is required (`nvm use` reads `.nvmrc`).

```sh
cp .env.example .env
npm run cli init-env
# set AUTHOR_EMAIL
# .env is gitignored; do not commit it
npm install
npm run dev
```

Then mint an author setup link:

```sh
npm run cli author-setup-link
```

Open that URL, redeem it, register a passkey. Upload a `.md` from `/admin`.

## Docker

```sh
cp .env.example .env
npm run cli init-env
# set DOMAIN, AUTHOR_EMAIL, PUBLIC_ORIGIN=https://$DOMAIN
docker compose up --build
```

## Updating

```sh
./scripts/update.sh
```

Fast-forwards to the reviewed `main`, rebuilds, backs up `DATA_DIR`, restarts, and rolls back if the app does not come up. Dependency updates are proposed by Dependabot after a cooldown and tested in CI before they get here; see [documentation/dependencies.md](documentation/dependencies.md).

See [documentation/install.md](../documentation/install.md). Compose bind-mounts `DATA_DIR`. Do not run Vite and the Compose app together; git sidecar + `npm run dev` is documented in [git-adapter.md](../documentation/git-adapter.md).
