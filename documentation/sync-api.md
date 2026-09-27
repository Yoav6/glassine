# Sync API

A general-purpose REST alternative to the [git adapter](git-adapter.md), for any client that wants to keep a local copy of selected documents in step with Glassine — not just the Obsidian plugin (`obsidian-glassine-sync`) this was built for. Nothing here is Obsidian-specific: the endpoints, the pairing flow, and the auth model are all plain HTTP, documented so a different client (another note app, a script, a future plugin) can be written against them without reading Glassine's source.

Unlike the git adapter, the server never initiates contact with a client — there is no webhook, no SSE feed into this API. A client is expected to poll on its own schedule and push on its own changes. There is also no conflict-resolution machinery: if a document changes on both sides between polls, whichever write reaches the server last wins, silently. Clients that sync promptly on every local change keep this window small.

Always on — there is no `SYNC_ENABLED` flag, unlike the git adapter's `GIT_SYNC_SECRET`. Pairing is author-only; reviewers cannot pair a device.

## Auth: device pairing

A device (a paired Obsidian vault, or any other client) authenticates with a bearer token that stays valid until it's revoked — there is no expiry timer and no refresh flow. Getting that token the first time is a short, human-in-the-loop pairing exchange modeled on OAuth's device-authorization grant:

1. **`POST /api/sync/pair/start`** — no auth. Body: `{ "deviceName": "My Laptop Vault" }`. Response: `{ "code": "...", "pairUrl": "https://.../pair?code=...", "expiresAt": "..." }`. The pairing expires in 10 minutes if never approved.
2. The client opens `pairUrl` in a browser. That page requires an author session (existing passkey login) and shows the device name with an **Approve** button — this is the only place a human is involved.
3. **`POST /api/sync/pair/approve`** — author session required (browser cookie, not a device token). Body: `{ "code": "..." }`. Mints the device's token server-side; the raw token is never sent to the browser.
4. Meanwhile the client polls **`POST /api/sync/pair/poll`** — no auth, body `{ "code": "..." }` — roughly every second or two. Response is one of:
   - `{ "status": "pending" }` — not approved yet, keep polling.
   - `{ "status": "approved", "token": "..." }` — the pairing's raw token, delivered exactly once. The pairing record is deleted immediately after this response, so store the token now; it cannot be retrieved again.
   - `{ "status": "expired" }` — the pairing window passed, or its token was already collected. Start over from step 1.
5. From then on, send the token as `Authorization: Bearer <token>` on every sync request.

If the server process restarts between step 3 and step 4, the in-flight token is lost (it's held in memory, never written to disk in plaintext) and the poll returns `expired` — same as any other expired pairing. Start pairing again.

Revoke a device from **Admin → Devices**. A revoked token gets `401 Invalid or revoked device token` on its next request.

## Endpoints

All of the following require `Authorization: Bearer <device token>` and act as the author who approved that device.

### `GET /api/sync/documents`

List every document, so a client can match its own local files to existing ones.

```json
{
  "documents": [
    { "slug": "roadmap", "relativePath": "roadmap.md", "title": "Roadmap", "version": 4, "url": "https://.../documents/roadmap" }
  ]
}
```

### `POST /api/sync/documents`

Create a new document from a client-side file with no existing match.

Request: `{ "filename": "New Note.md", "content": "..." }`
Response: `{ "slug": "new-note", "version": 1, "url": "https://.../documents/new-note" }`

A client's usual flow: when a local file is newly marked for sync with nothing identifying an existing document, call this, then remember the returned `url` (e.g. by writing it back into the file) so future syncs go to the endpoints below instead of creating duplicates.

### `GET /api/sync/documents/[slug]`

Pull current content. Response: `{ "content": "...", "version": 4 }`.

### `POST /api/sync/documents/[slug]`

Push new content for an existing document. Request: `{ "content": "..." }`. Response: `{ "version": 5 }` (unchanged `version` if the content was identical to what's already stored). `404` if the slug doesn't exist — create it with `POST /api/sync/documents` instead.

Versions written this way appear in a document's history with `source: "sync"`, alongside `upload`, `edit`, `accept`, `unaccept`, and `git`.

### `GET /api/sync/assets/[...path]`

Pull the current bytes of a vault-relative image path. Response is the raw image bytes with the appropriate `Content-Type`. `404` if nothing exists at that path, or if it isn't an image.

### `POST /api/sync/assets/[...path]`

Upsert an image at an exact vault-relative path — request body is the raw bytes, `Content-Type` set to the image's MIME type. Unlike uploading through Admin, this never renames on collision: pushing to a path a document's markdown already references is meant to overwrite it. `400` if the path's extension isn't a recognized image type.

A client's usual flow for an embedded image: resolve the local embed to a vault-relative path, `POST` its bytes here, then write an `![[path]]` / `![[path|alias]]` wiki-embed reference to that same path into the document content before pushing the document itself. That's the *only* embed syntax Glassine resolves against the vault — a plain `![](path)` markdown image is always treated as an external URL, used exactly as given, never resolved locally; local files are embedded exclusively via the wiki-bracket form, keeping that distinction unambiguous. A wiki-embed's path is always vault-root-relative (there's no relative-to-document-folder form for it), so a client whose local link relies on something Glassine can't resolve the same way (e.g. Obsidian's vault-wide fuzzy filename matching) needs to substitute in the fully-resolved path before pushing.

## Admin

**Admin → Devices** lists paired devices (name, paired-at, last-used-at) with a **Revoke** action. There is no self-serve unpairing from a client — revocation is always done from Glassine.
