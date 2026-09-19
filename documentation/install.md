# Install

## Requirements

- Node.js 22.12 or newer for local development (`glassine/.nvmrc`)
- Docker and Compose for production
- An HTTPS origin in production (passkeys require a secure context; `localhost` is allowed)

## Environment

Copy `glassine/.env.example` to `.env` (that file is gitignored), or run `npm run cli init-env` from `glassine/` to create it and fill empty secrets. Required:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_ORIGIN` | Better Auth base URL, no trailing slash |
| `BETTER_AUTH_SECRET` | 32+ byte secret (`openssl rand -base64 32`) |
| `AUTHOR_EMAIL` | Seeded author; there is no public signup |
| `DATA_DIR` | SQLite + `documents/` (default `./data`; Compose bind-mounts this path at `/data`) |
| `DOMAIN` | Hostname for Caddy and WebAuthn `rpID` |

Optional: `SMTP_URL` and `MAIL_FROM` enable author email-OTP recovery. Git vars are listed in [git-adapter.md](git-adapter.md) (`npm run cli init-env --git`). `BETTER_AUTH_TRUSTED_ORIGINS` is a comma list if the auth origin must allow extra hosts. Localhost already includes the Vite and Playwright ports.

## Local development

```sh
cd glassine
nvm use
cp .env.example .env
npm install
npm run cli init-env
npm run dev
npm run cli author-setup-link
```

Open the printed URL, redeem the one-shot setup token, register a passkey. Visit `/admin`. Use `http://localhost:5173`, not `127.0.0.1`, so the passkey `rpID` matches.

## Docker Compose

Default profile is **app + Caddy**. SQLite and `documents/` live in `DATA_DIR` on the host (default `./data`). Compose bind-mounts that directory at `/data`. Do not run Vite and the Compose **app** at the same time. A git **sidecar** plus `npm run dev` is supported; see [git-adapter.md](git-adapter.md).

```sh
cd glassine
cp .env.example .env
npm run cli init-env
# set DOMAIN, AUTHOR_EMAIL, PUBLIC_ORIGIN=https://$DOMAIN
docker compose up --build
docker compose exec app npm run cli author-setup-link
```

Caddy terminates TLS with Let's Encrypt. The reverse proxy uses `flush_interval -1` so SSE is not buffered. If `:80`/`:443` must stay unpublished, merge the loopback overlay in [git-adapter.md](git-adapter.md) (Vite + git sidecar, or `COMPOSE_PROFILES=git,app` for the Compose app on loopback).

### Profiles

```sh
# git HTTP remote: npm run cli init-env --git  (sets COMPOSE_PROFILES=git), then:
docker compose up --build
# equivalent: docker compose --profile git up --build

docker compose --profile backup up --build  # Litestream replica; set LITESTREAM_REPLICA_URL
```

Backups: copy `DATA_DIR` (markdown + SQLite) and optionally replicate SQLite with Litestream. Test a restore.

## Break-glass author access

If passkeys and the mailbox are gone, SSH to the host and run `author-setup-link` again. That mints a new one-shot setup session. There is no password login.
