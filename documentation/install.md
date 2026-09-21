# Install

## Requirements

- Node.js 22.12 or newer for local development (`.nvmrc`)
- Docker and Compose for production
- An HTTPS origin in production (passkeys require a secure context; `localhost` is allowed)

## Environment

Copy `.env.example` to `.env` (that file is gitignored), or run `npm run cli init-env` to create it and fill empty secrets. Required:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_ORIGIN` | Better Auth base URL, no trailing slash |
| `BETTER_AUTH_SECRET` | 32+ byte secret (`openssl rand -base64 32`) |
| `AUTHOR_EMAIL` | Seeded author; there is no public signup |
| `DATA_DIR` | SQLite + `documents/` (default `./data`; Compose bind-mounts this path at `/data`) |
| `DOMAIN` | The hostname people type in the browser, with no scheme (`glassine.example.com`). It is the WebAuthn `rpID`, so a passkey only works on exactly this host or a subdomain of it, and it is Caddy's site address in the bundled Compose setup |

`PUBLIC_ORIGIN` must be `https://` plus `DOMAIN`. Session cookies are marked `Secure` when it starts with `https://`.

`APP_UID` and `APP_GID` (Compose only) are the user the app container runs as. `init-env` fills them with your own; without them it runs as uid 1000.

The Docker image accepts request bodies up to 2 MB, which bounds the size of an uploaded document or image. Raise or lower it with `BODY_SIZE_LIMIT` (`512K`, `5M`, or `Infinity` for no limit) in the container environment; the size applies to the whole request, so a file just under the limit fits.

Optional: `SMTP_URL` and `MAIL_FROM` enable author email-OTP recovery. Git vars are listed in [git-adapter.md](git-adapter.md) (`npm run cli init-env --git`). `BETTER_AUTH_TRUSTED_ORIGINS` is a comma list if the auth origin must allow extra hosts. Localhost already includes the Vite and Playwright ports.

## Local development

```sh
nvm use
cp .env.example .env
npm install
npm run cli init-env
npm run dev
npm run cli author-setup-link
```

Open the printed URL, redeem the one-shot setup token, register a passkey. Visit `/admin`. Use `http://localhost:5173`, not `127.0.0.1`, so the passkey `rpID` matches.

## Docker

There are two ways to run the container. Pick by what already owns ports 80 and 443 on the machine.

| | Ports 80/443 are free | Something else already terminates TLS (SWAG, nginx, Traefik, Caddy) |
| --- | --- | --- |
| Use | [Compose with Caddy](#compose-with-caddy) | [The published image behind your proxy](#behind-an-existing-reverse-proxy) |
| Gets a certificate from | Caddy (Let's Encrypt, HTTP challenge) | Your proxy |
| Image | Built from source on the machine | Pulled from ghcr.io |

### Compose with Caddy

Default profile is **app + Caddy**. SQLite and `documents/` live in `DATA_DIR` on the host (default `./data`). Compose bind-mounts that directory at `/data`. The app container is not root: `init-env` creates `DATA_DIR` as you and records your uid and gid in `.env` (`APP_UID`, `APP_GID`), and Compose runs the app, and Litestream if enabled, as that user, so everything in the folder stays yours. If you skip `init-env`, create the folder yourself before the first `docker compose up`, because Docker would create it owned by root and the app could not write to it. Do not run Vite and the Compose **app** at the same time. A git **sidecar** plus `npm run dev` is supported; see [git-adapter.md](git-adapter.md).

```sh
git clone https://github.com/Yoav6/glassine.git && cd glassine
cp .env.example .env
npm run cli init-env
# set DOMAIN, AUTHOR_EMAIL, PUBLIC_ORIGIN=https://$DOMAIN
docker compose up --build
docker compose exec app npm run cli author-setup-link
```

Point a DNS record for `DOMAIN` at the machine first; Caddy needs it to obtain the certificate. Caddy terminates TLS with Let's Encrypt. The reverse proxy uses `flush_interval -1` so SSE is not buffered. If `:80`/`:443` must stay unpublished, merge the loopback overlay in [git-adapter.md](git-adapter.md) (Vite + git sidecar, or `COMPOSE_PROFILES=git,app` for the Compose app on loopback).

### Behind an existing reverse proxy

If the server already runs a proxy that owns 443, do not use the repo's `compose.yaml`: its Caddy would compete for the same ports. Run only the app, from the published image, and let your proxy forward to it.

**The image.** `ghcr.io/yoav6/glassine` is published from every commit on `main` as a multi-architecture manifest (`linux/amd64` and `linux/arm64`), so the same reference pulls on an x86 or an ARM server. Tags:

| Tag | Meaning |
| --- | --- |
| `latest` | The newest commit on `main` |
| `sha-<short>` | One exact commit. Pin this to make updates and rollbacks deliberate |
| `1.2.3`, `1.2` | Release tags, when a `v1.2.3` git tag is pushed |

If pulling fails with `denied`, the package is private: run `docker login ghcr.io` with a token that has `read:packages`, or make the package public in its GitHub settings.

**The service.** Add this next to your proxy in its compose file (change the hostname, email and paths):

```yaml
  glassine:
    image: ghcr.io/yoav6/glassine:latest
    container_name: glassine
    restart: unless-stopped
    environment:
      - DOMAIN=glassine.example.com
      - PUBLIC_ORIGIN=https://glassine.example.com
      - AUTHOR_EMAIL=you@example.com
      - BETTER_AUTH_SECRET=${GLASSINE_AUTH_SECRET}   # openssl rand -base64 32, kept in a .env beside this file
    volumes:
      - ./appdata/glassine:/data
```

Things this leaves out on purpose:

- **No `ports:`.** The app listens on 3000 inside the container. Your proxy reaches it over the Docker network as `glassine:3000`, which works when both services are in the same compose project (or otherwise share a network).
- **No `ORIGIN`, `PORT` or `HOST`.** The image already defaults to `0.0.0.0:3000`, and the Node server builds the site's origin from the `Host` header it is sent, assuming `https`. That is why the proxy must forward `Host` unchanged (below).
- **No Caddy, no git sidecar.** The sidecar is built from `deploy/git` in a source checkout, so it is not part of the image; see [git-adapter.md](git-adapter.md).

**File ownership.** The container does not run as root. It runs as the image's `node` user, uid 1000, and the only place it writes is the data folder, so the SQLite database and `documents/` end up owned by uid 1000 on the host. That is normally you, the first user on a Linux host, so you can edit, back up and restore them without `sudo`. The folder has to exist and belong to that uid before the first start. If Docker creates it for you it is owned by root, and the app stops with `Cannot write to DATA_DIR`:

```sh
mkdir -p appdata/glassine
sudo chown 1000:1000 appdata/glassine   # skip the chown if `id -u` already prints 1000
```

If your uid is not 1000, run the container as yourself instead and own the folder with that uid:

```yaml
    user: "1001:1001"   # your `id -u` and `id -g`
```

Any uid works as long as it owns the data folder. A named Docker volume needs none of this, because the image hands `/data` to uid 1000 and a new volume inherits that.

**The proxy.** Whatever you use, it has to:

1. **Terminate TLS for the hostname** and forward to `glassine:3000` over plain HTTP.
2. **Pass the original `Host` header through.** SvelteKit rejects a form POST whose `Origin` differs from the origin it computed, with `403 Cross-site POST form submissions are forbidden`. A proxy that rewrites `Host` to the upstream's name would trigger that on every save.
3. **Not buffer or time out the live-update stream** at `/api/documents/<slug>/events` (server-sent events). The app sends `X-Accel-Buffering: no`, which nginx honors, and a ping every 25 seconds. For Caddy use `flush_interval -1`.
4. **Allow the request sizes you expect.** Authors upload `.md` files and images from `/admin`, and the app accepts request bodies up to 2 MB (`BODY_SIZE_LIMIT`, see below). nginx's own default cap is 1 MB, which would reject images before the app sees them, so raise it to at least 2 MB; SWAG's samples set `client_max_body_size 0` (no cap).

For [SWAG](https://docs.linuxserver.io/images/docker-swag/), copy a sample from `nginx/proxy-confs/`, name it `glassine.subdomain.conf`, and set the server name and upstream:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;

    server_name glassine.example.com;

    include /config/nginx/ssl.conf;

    client_max_body_size 0;

    location / {
        include /config/nginx/proxy.conf;   # sets Host and X-Forwarded-*, and 240 s proxy timeouts
        include /config/nginx/resolver.conf;
        set $upstream_app glassine;
        set $upstream_port 3000;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
    }
}
```

SWAG with `SUBDOMAINS=wildcard` and DNS validation already holds a `*.example.com` certificate, so a new subdomain needs a DNS record (a wildcard record counts) and this file, nothing else. `SWAG_AUTORELOAD=true` picks the file up; otherwise `docker exec swag nginx -s reload`.

**First run.**

```sh
docker compose up -d glassine
docker logs glassine                      # expect "Listening on http://0.0.0.0:3000"
docker exec glassine npm run cli author-setup-link
```

Open the printed link (it is built from `PUBLIC_ORIGIN`), redeem it, and register a passkey.

**Updating.** The source-checkout `scripts/update.sh` does not apply here; there is no checkout. Pull the new image and recreate the container:

```sh
docker compose pull glassine && docker compose up -d glassine
```

Copy the data folder first if you want a restore point, and use a `sha-<short>` tag instead of `latest` if you want to choose when an update happens and be able to name the version to roll back to.

### Profiles

These apply to the [Compose with Caddy](#compose-with-caddy) setup.

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
./scripts/update.sh          # fast-forward, rebuild, back up DATA_DIR, restart, roll back on failure
./scripts/update.sh --check  # report only; exit 2 means an update is waiting
```

This is for a source checkout (the Caddy setup above). An installation that runs the published image updates by pulling a newer image, as described under [Behind an existing reverse proxy](#behind-an-existing-reverse-proxy).

Installations never resolve new package versions themselves. The image is
rebuilt with `npm ci` from the reviewed `package-lock.json`, so two
installations on the same commit run identical dependencies. Dependency updates
are proposed by Dependabot after a cooldown and tested in CI before they reach
`main` — see [dependencies.md](dependencies.md).

## Break-glass author access

If passkeys and the mailbox are gone, SSH to the host and run `author-setup-link` again. That mints a new one-shot setup session. There is no password login.
