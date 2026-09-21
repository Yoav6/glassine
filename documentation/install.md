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

## Backups

Everything Glassine stores lives in `DATA_DIR`: the SQLite database (accounts, invites, comments, suggestions) and the `documents/` folder of `.md` files. The simplest backup is copying that whole folder.

The optional `backup` profile adds [Litestream](https://litestream.io), which continuously copies the SQLite database (a second or so behind) to a **replica**, a storage location of your choosing. It does not cover `documents/`, so keep copying that folder too. Set the location in `.env` (see `.env.example`), for example `LITESTREAM_REPLICA_URL=s3://my-bucket/glassine`, plus `LITESTREAM_ACCESS_KEY_ID` and `LITESTREAM_SECRET_ACCESS_KEY` for S3-compatible storage, then:

```sh
docker compose --profile backup up -d
docker compose logs litestream   # look for "snapshot complete"
```

If that container keeps restarting with `file replica path required`, `LITESTREAM_REPLICA_URL` is empty.

### Test a restore

A backup you have never restored is a guess. This restores the replica into a scratch file next to the live database and checks it, without touching the live database. Do it once after setting up backups, and again after upgrading Litestream.

```sh
# 1. Restore into a scratch file (it refuses to overwrite, so remove any old one first)
docker compose --profile backup run --rm --no-deps litestream \
  restore -config /etc/litestream.yml -o /data/restore-test.db /data/glassine.db

# 2. Check it: integrity should be "ok" and the counts should be close to the live database
docker compose exec app node -e "
const Database = require('better-sqlite3');
const restored = new Database('/data/restore-test.db', { readonly: true });
const live = new Database('/data/glassine.db', { readonly: true });
console.log('integrity:', restored.pragma('integrity_check')[0].integrity_check);
console.log('users  restored:', restored.prepare('select count(*) n from user').get().n,
            ' live:', live.prepare('select count(*) n from user').get().n);
"

# 3. Remove the scratch file
docker compose exec app sh -c 'rm -f /data/restore-test.db*'
```

The restored copy can trail the live one by the last second or two of writes.

### Recover after losing the database

Use this only if the live database is damaged or gone. It replaces it with the replica.

```sh
docker compose --profile backup stop app litestream
mkdir -p "${DATA_DIR:-./data}/damaged"
mv "${DATA_DIR:-./data}"/glassine.db* "${DATA_DIR:-./data}/damaged/"
docker compose --profile backup run --rm --no-deps litestream \
  restore -config /etc/litestream.yml -o /data/glassine.db /data/glassine.db
docker compose --profile backup up -d
```

Replication resumes on its own. Keep the `damaged/` folder until you have checked the result. `documents/` is not in the replica; restore it from your folder backup.

## Updating

```sh
cd glassine
./scripts/update.sh          # fast-forward, rebuild, back up DATA_DIR, restart, roll back on failure
./scripts/update.sh --check  # report only; exit 2 means an update is waiting
```

Installations never resolve new package versions themselves. The image is
rebuilt with `npm ci` from the reviewed `package-lock.json`, so two
installations on the same commit run identical dependencies. Dependency updates
are proposed by Dependabot after a cooldown and tested in CI before they reach
`main` — see [dependencies.md](dependencies.md).

## Break-glass author access

If passkeys and the mailbox are gone, SSH to the host and run `author-setup-link` again. That mints a new one-shot setup session. There is no password login.
