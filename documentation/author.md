# Author guide

## First login

1. On first boot the app seeds `AUTHOR_EMAIL` with `role=author`.
2. Run `npm run cli author-setup-link` (or `docker compose exec app npm run cli author-setup-link`).
3. Open the URL, redeem it, register a passkey. Register a second authenticator from `/admin/settings` when you can.

Later logins: `/login` → **Sign in with passkey**. Email OTP appears only if `SMTP_URL` and `MAIL_FROM` are set. Opening `/admin` while this browser only has a reviewer session still shows that passkey screen. If this browser also has an author session, each tab asks which account to use; closing a tab forgets that tab’s choice. The navbar menu lists every session on the device (even if there is only one) and signs each one out on its own row.

## Settings

`/admin/settings`: display name, passkeys (add, rename, remove), theme, navigation bar placement (top or bottom), document titles, and whether git and email recovery are on. Email is the seeded `AUTHOR_EMAIL` and is not editable there. You cannot remove the last passkey unless email OTP is configured. Theme and bar placement are stored in this browser.

**Title** (under Appearance) chooses what the documents list, browser tab, and (for file name or YAML) a display-only heading at the top of the editor show: **File name** (default), **First heading**, or a **YAML property** you name (for example `title`). If a heading or property is missing, Glassine uses the file name. Editing that display heading (in author **Editing**) renames the file or updates the YAML value; it is not written into the markdown body. Reviewers can comment and suggest on it. It is hidden in YAML + source mode, where the property is already visible.

## Documents

`/admin` lists hosted documents. Upload a `.md`; the stored file name is the one you uploaded (the URL still uses a slug). The displayed title follows the Title setting. Each row has download and delete. Download is also on the document bar (the same bytes the adapter would export).

The document navbar has a **Mode** menu: **Reading**, **Reading (modified)**, **Suggesting**, and **Editing** (the default). Next to it, **Rich text** (default) and **Source** choose the surface; both work in every mode. **Manage access** is only on this bar, and only for the open document: every reviewer, people with a grant first, then the rest, each alphabetically. A checkbox grants or revokes this document; **Copy invite** mints a deep link and replaces the previous URL. **Editing** types into the article as ordinary text; autosave writes those edits into the file. Reviewer suggestions already on the page stay pending until you Accept or Reject them. **Suggesting** keeps your own edits pending as annotations, the same pipeline reviewers use. **Reading** hides comments and suggestions and makes the document read-only. **Reading (modified)** is also read-only, but shows the document as if every suggestion you can see had been accepted.

## Reviewers and grants

`/admin/reviewers`: add a person (name, email, optional highlight colour). If you leave colour blank, Glassine assigns a unique one. Colour is theirs on every document. Edit those details later, or **Delete** to remove the person and revoke every grant and invite.

**Manage access** opens grants for that person. Visibility:

- **Own only** — they see their comments and suggestions
- **All reviewers** — they see everyone’s

**Grant access** / **Revoke access** are per document. **Copy invite** on the reviewer card mints their personal login URL and replaces the previous URL. Inside **Manage access**, copy a deep link to one document the same way. Send it in chat; v1 does not email invites. Rotate the same way if a link was forwarded.

A leaked personal login is that person until you rotate. Revoke a grant to take one document away.

## Accept and reject

Open the document in **Editing**. Suggestions are painted in each reviewer’s colour. Hover a suggestion to get a small bar: checkmark accepts, comment replies on that suggestion, X rejects. Select text to get the same bar with only the comment icon. In **Suggesting**, the checkmark is hidden — you can still comment and reject. The bar stays a moment after you leave the highlight, and stays while the pointer is on the bar or the caret is in the suggestion. Overlapping suggestions on the same passage show in the side panel; **Accept & reject others** is the bulk action. Accepting Alice’s rewrite will detach Bob’s on that sentence — that is expected; the outdated panel explains it.

Detached items keep the original quote and a heading/paragraph hint. Re-attach by selecting a new passage and confirming.
