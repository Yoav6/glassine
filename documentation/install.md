# Install

## Requirements

- Node.js 22.12 or newer for local development (`glassine/.nvmrc`)
- Docker and Compose for production
- An HTTPS origin in production (passkeys require a secure context; `localhost` is allowed)

## Environment

Copy `glassine/.env.example` to `.env` (that file is gitignored). Required:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_ORIGIN` | Better Auth base URL, no trailing slash |
| `BETTER_AUTH_SECRET` | 32+ byte secret (`openssl rand -base64 32`) |
| `AUTHOR_EMAIL` | Seeded author; there is no public signup |
| `DATA_DIR` | SQLite + `documents/` (default `./data`, Docker `/data`) |
| `DOMAIN` | Hostname for Caddy and WebAuthn `rpID` |

Optional: `SMTP_URL` and `MAIL_FROM` enable author email-OTP recovery. Git vars are listed in [git-adapter.md](git-adapter.md). `BETTER_AUTH_TRUSTED_ORIGINS` is a comma list if the auth origin must allow extra hosts. Localhost already includes the Vite and Playwright ports.

## Local development

```sh
cd glassine
nvm use
cp .env.example .env
npm install
npm run dev
npm run cli author-setup-link
```

Open the printed URL, redeem the one-shot setup token, register a passkey. Visit `/admin`. Use `http://localhost:5173`, not `127.0.0.1`, so the passkey `rpID` matches.

## Docker Compose

Default profile is **app + Caddy**. One named volume holds `glassine.db` (WAL) and `documents/`.

```sh
cd glassine
cp .env.example .env
# set DOMAIN, BETTER_AUTH_SECRET, AUTHOR_EMAIL, PUBLIC_ORIGIN=https://$DOMAIN
docker compose up --build
docker compose exec app npm run cli author-setup-link
```

Caddy terminates TLS with Let's Encrypt. The reverse proxy uses `flush_interval -1` so SSE is not buffered.

### Profiles

```sh
docker compose --profile git up --build     # git HTTP remote, see git-adapter.md
docker compose --profile backup up --build  # Litestream replica; set LITESTREAM_REPLICA_URL
```

Backups: copy the markdown volume and replicate SQLite with Litestream. Test a restore.

## Break-glass author access

If passkeys and the mailbox are gone, SSH to the host and run `author-setup-link` again. That mints a new one-shot setup session. There is no password login.
