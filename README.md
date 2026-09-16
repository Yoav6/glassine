# Glassine

Private, per-reviewer suggestion and comment review for markdown articles. Reviewers get a WYSIWYG document in suggestion mode; accepted edits splice into a hosted `.md` file. Licensed AGPL-3.0.

Full documentation lives in [`../documentation`](../documentation/README.md).

## Quick start (development)

Node 22.12+ is required (`nvm use` reads `.nvmrc`).

```sh
cp .env.example .env
# set BETTER_AUTH_SECRET (openssl rand -base64 32) and AUTHOR_EMAIL
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
docker compose up --build
```

See [documentation/install.md](../documentation/install.md).
