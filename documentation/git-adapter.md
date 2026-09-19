# Git / Obsidian adapter

Off by default. Upload and download always work. Enabling the adapter does not change isolation: comments still live in SQLite.

The adapter is on when `GIT_SYNC_SECRET` is set. Compose starts the git HTTP daemon with `COMPOSE_PROFILES=git` (or `docker compose --profile git`). Host `DATA_DIR` (default `./data`) is bind-mounted at `/data`, so existing uploads stay when you turn git on. The clone’s `origin` is the relative path `../git/glassine.git` so the same tree works from the container and from `npm run dev`.

Set `GIT_REMOTE_URL` when the remote is not `https://git.$DOMAIN/glassine.git`. Set `GIT_SYNC_URL` when the hook should not POST to the Compose app (`http://app:3000/api/adapter/sync`). Admin → Settings shows the remote URL.

Do not run **Vite and the Compose `app` service** at the same time (one SQLite writer, one passkey origin). The git **sidecar** plus Vite is the intended hot-reload setup.

## Enable

```sh
cd glassine
npm run cli init-env --git
# set DOMAIN (and AUTHOR_EMAIL / PUBLIC_ORIGIN as in install.md)
docker compose up --build
```

`init-env --git` writes `COMPOSE_PROFILES=git`, `GIT_HTTP_TOKEN`, and `GIT_SYNC_SECRET` if they are missing. It does not rotate secrets that are already set. `GIT_SYNC_SECRET` is internal (the `post-receive` hook). Obsidian uses `GIT_HTTP_TOKEN`.

### HTTPS (Caddy)

Default Compose: Caddy on host `:80`/`:443`, git at `https://git.$DOMAIN/glassine.git` with HTTP basic auth (`git` / `GIT_HTTP_TOKEN`). The hook notifies `http://app:3000/api/adapter/sync`. Use the Compose origin in the browser, not Vite.

### Vite + git sidecar

Hot reload and Obsidian sync: Vite is the only Node app; Compose runs **git only**. Needs `git` on the host `PATH` (accept/commit runs in Vite). `DATA_DIR` must be writable by your user (Docker as root can leave files owned by root; `chown -R "$(whoami)" "$DATA_DIR"` if `npm run dev` cannot open SQLite).

```sh
npm run cli init-env --git --loopback
docker compose up --build --remove-orphans
npm run dev
```

That sets `COMPOSE_FILE`, `GIT_REMOTE_URL=http://127.0.0.1:8081/glassine.git`, and `GIT_SYNC_URL=http://host.docker.internal:5173/api/adapter/sync`. Open **http://localhost:5173**. Vite listens on `0.0.0.0:5173` so the hook can reach it from Docker.

With this overlay, `COMPOSE_PROFILES=git` does not start `app` or Caddy. `COMPOSE_PROFILES=git,app` starts the Compose app on `127.0.0.1:3000` as well (then stop Vite and point `GIT_SYNC_URL` back at `http://app:3000/api/adapter/sync`).

## How it works

`/data/documents` is a working clone of the local bare repo `/data/git/glassine.git`. The Node process that handles author writes commits and pushes **locally** behind the same document lock. It does not push to itself over the network.

When you (or obsidian-git) push to the bare repo, `post-receive` POSTs to `GIT_SYNC_URL` with `GIT_SYNC_SECRET`. That process pulls, treats changed `.md` files as new base versions, rebases annotations, and broadcasts SSE. Open document views also `git fetch` on a one-second loop (and poll the document version), so a missed hook still applies the new text in place without a reload. Ingest from git does not commit back to git, so the hook cannot loop.

The hook is best-effort (it must not fail the push). If curl cannot reach Vite (`host.docker.internal:5173`) or the Compose app, the push still succeeds; an open document still picks up the origin within about a second. Opening a document or Admin also fetches if the clone is behind. Recreate the git container to refresh `post-receive` (the image writes it on start). Hook failures are appended to `DATA_DIR/git/hook.log`.

The git image installs `curl` and writes the hook on every start. `git-http-backend` runs as the owner of `DATA_DIR` so HTTP push and host-side `git push` can both write the bind-mounted bare repo. The hook uses a short curl timeout so a down app cannot 502 the push. Bare-repo `http.receivepack` is enabled. If `/data/documents` already has files when the profile is first enabled, the entrypoint attaches the clone’s `.git` directory instead of failing `git clone` into a non-empty folder.

## Obsidian

Desktop [obsidian-git](https://github.com/vinzent03/obsidian-git) over HTTP(S) + token. Do not use SSH (not in the default Compose profile). Mobile is unstable; treat phone vaults as read-mostly. Comments and unaccepted suggestions never appear in the vault; only accepted `.md` does.

Plugin docs: [Getting started](https://publish.obsidian.md/git-doc/Getting+Started), [Authentication](https://publish.obsidian.md/git-doc/Authentication).

### Values to copy

Take the remote from Admin → Settings (or `init-env` output). **Copy remote with token** on that page puts `http://git:<token>@…` on the clipboard (author session only). Defaults:

| What | HTTPS (Caddy) | Vite sidecar / loopback |
| --- | --- | --- |
| Remote URL (no password) | `https://git.<DOMAIN>/glassine.git` | `http://127.0.0.1:8081/glassine.git` |
| Remote URL (desktop clone) | `https://git:<GIT_HTTP_TOKEN>@git.<DOMAIN>/glassine.git` | `http://git:<GIT_HTTP_TOKEN>@127.0.0.1:8081/glassine.git` |
| Remote name | `origin` | `origin` |
| Username | `git` | `git` |
| Password | `GIT_HTTP_TOKEN` in `.env` (hex from `init-env --git`) | same |

Never put `GIT_SYNC_SECRET` in Obsidian. That secret is only for the server hook. Do not store the password-bearing URL in Admin; Settings shows the URL without credentials.

### Install the plugin

1. Open the vault you want to sync (or create an empty vault if you will clone Glassine’s repo).
2. Settings → **Community plugins** → turn off Restricted mode → **Browse** → search **Git** (author Vinzent) → Install → Enable.
3. Settings → Community plugins → **Git** (the gear).

### Plugin settings (Git)

**Desktop** uses your system `git`. The plugin only shows **Author name for commit** and **Author email for commit** (under **Commit author**). There are no username/password fields. Those exist only on **mobile** (isomorphic-git), under **Authentication/commit author**.

On desktop, put credentials **in the remote URL**. `init-env --git` writes a hex `GIT_HTTP_TOKEN` so this is safe (no `/` or `+`):

`http://git:<GIT_HTTP_TOKEN>@127.0.0.1:8081/glassine.git`

or

`https://git:<GIT_HTTP_TOKEN>@git.<DOMAIN>/glassine.git`

If Git still opens a GTK password dialog (`canberra` errors), cancel it and use the URL above. A leftover credential helper may send a blank or old password (`Authentication failed` while the error URL hides `git:token@`). Clear it:

```sh
printf "protocol=http\nhost=127.0.0.1:8081\n\n" | git credential reject
```

Until a round trip works, turn **off** automatic commit, pull, and push. Use the command palette instead.

### `.gitignore`

In the vault root, create `.gitignore` (or use the plugin’s gitignore editor):

```gitignore
.obsidian/
.trash/
.DS_Store
```

If `.obsidian/` is already committed, stop tracking it from a terminal in the vault: `git rm -r --cached .obsidian`.

### Connect the remote

Command palette: Ctrl+P (Windows/Linux) or Cmd+P (macOS). Type `Git:` to filter. Command names below match the plugin (the palette prefixes them with **Git:**).

**A. Empty vault — clone Glassine**

Use this when Glassine already has commits (imported documents or accepted edits). Git clones into a new folder.

**Using the plugin UI:**
1. Command palette → **Clone an existing remote repository**.
2. **First prompt (remote URL):** `http://git:<GIT_HTTP_TOKEN>@127.0.0.1:8081/glassine.git` (or the `https://git:…@git.<DOMAIN>/…` form). If you submit the command name instead, Git reports `fatal: repository 'an existing remote repository' does not exist`.
3. **Second prompt (directory):** a **new folder name** under the current vault, e.g. `glassine`. It must be empty or not exist yet. Do not use `.` (the vault already has `.obsidian/`) or `..` (parent of the vault).
4. After the clone, either **Open folder as vault** on that subfolder, or move its contents (including `.git`) up to the vault root.
5. Restart Obsidian if the plugin asks.

**Alternatively, from a terminal** (same URL with `git:TOKEN@`):

```sh
git clone http://git:<GIT_HTTP_TOKEN>@127.0.0.1:8081/glassine.git /path/to/MyVault
```

Then Obsidian → Open folder as vault. `MyVault` must not exist yet or must be empty.

**B. Vault that already has notes — init, then pull**

Prefer **A** if the vault is empty. If the remote already has files, pull before you push so you do not overwrite Glassine’s tree.

1. **Initialize a new repo**.
2. Add `.gitignore` as above, then **Commit all changes with specific message** (e.g. `vault ignore`).
3. **Edit remotes** → name `origin`, URL from the table. The first **Push** can prompt for the same name and URL if no remote exists yet.
4. **Pull**, then work as below.

### Day-to-day commands

| You want | Command palette |
| --- | --- |
| Download Glassine / accepted edits | **Pull** |
| Save vault files as a commit | **Commit all changes with specific message** (or stage in the source-control view, then commit) |
| Upload to Glassine | **Push** |
| Commit then push | **Commit-and-sync** (only after the manual round trip works) |
| Remotes | **Edit remotes** |
| Status UI | **Open source control view** (or the Git ribbon icon) |

### Check the round trip

1. In Obsidian, add or edit a `.md` file → commit → **Push**. Reload the document (or Admin) in Glassine if it does not update immediately — ingest also runs on those page loads, not only on the hook.
2. In Glassine, accept an edit → in Obsidian **Pull**. The accepted markdown should change; comments should not appear in the file.

If push asks for a password every time, configure a git credential helper on the desktop ([Authentication](https://publish.obsidian.md/git-doc/Authentication)). Username stays `git`; the stored password is `GIT_HTTP_TOKEN`.

## Without the profile

`/data/documents` is a plain directory. No git process, no extra port, no token.
