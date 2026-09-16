# Git / Obsidian adapter

Off by default. Upload and download always work. Enabling the adapter does not change isolation: comments still live in SQLite.

## Enable

```sh
# .env
GIT_ENABLED=true
GIT_HTTP_TOKEN=...
GIT_SYNC_SECRET=...

docker compose --profile git up --build
```

This starts a sibling git-http-backend service. Caddy serves it at `git.$DOMAIN` with HTTP basic auth (`git` / `GIT_HTTP_TOKEN`). `/data/articles` is a working clone of the local bare repo `/data/git/glassine.git`. The app commits and pushes **locally** behind the same document lock. It does not push to itself over the network.

When you (or obsidian-git) push to the bare repo, `post-receive` POSTs to `/api/adapter/sync` with `GIT_SYNC_SECRET`. The app pulls, treats changed `.md` files as new base versions, rebases annotations, and broadcasts SSE. Ingest from git does not commit back to git, so the hook cannot loop.

The git image installs `curl` and writes the hook with the sync secret on every start. Bare-repo `http.receivepack` is enabled. If `/data/articles` already has files when the profile is first enabled, the entrypoint attaches the clone’s `.git` directory instead of failing `git clone` into a non-empty folder.

Allowlist files in the vault with `.gitignore`. Never sync `.obsidian/` or `.trash/`.

## Obsidian

Use [obsidian-git](https://github.com/vinzent03/obsidian-git) over HTTPS + token (not SSH in the default profile). An SSH sidecar on `2222` is possible later; it is not the default. Mobile obsidian-git is unstable; treat mobile as read-mostly.

## Without the profile

`/data/articles` is a plain directory. No git process, no extra port, no token.
