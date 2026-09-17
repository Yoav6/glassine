# Author guide

## First login

1. On first boot the app seeds `AUTHOR_EMAIL` with `role=author`.
2. Run `npm run cli author-setup-link` (or `docker compose exec app npm run cli author-setup-link`).
3. Open the URL, redeem it, register a passkey. Register a second authenticator from `/admin/settings` when you can.

Later logins: `/login` → **Sign in with passkey**. Email OTP appears only if `SMTP_URL` and `MAIL_FROM` are set. Opening `/admin` while this browser only has a reviewer session still shows that passkey screen. If this browser also has an author session, each tab asks which account to use; closing a tab forgets that tab’s choice. The navbar menu lists every session on the device (even if there is only one) and signs each one out on its own row.

## Settings

`/admin/settings`: display name, passkeys (add, rename, remove), theme, and whether git and email recovery are on. Email is the seeded `AUTHOR_EMAIL` and is not editable there. You cannot remove the last passkey unless email OTP is configured.

## Articles

`/admin` lists hosted articles. Upload a `.md`. The first heading becomes the title when present. Download is always available (`Download .md` on the article, or the same bytes the adapter would export).

The article navbar has a **Mode** menu: **Reading**, **Reading (modified)**, **Suggesting**, and **Editing** (the default). Editing is the same WYSIWYG surface reviewers use, with Suggest on; your typing is saved as surgical substitutions into the file — not as pending annotations. Reviewer suggestions already on the page are left pending until you Accept or Reject them. **Suggesting** keeps your own edits pending instead of auto-accepting them. **Reading** hides comments and suggestions and makes the article read-only. **Reading (modified)** is also read-only, but shows the article as if every suggestion you can see had been accepted.

## Reviewers and grants

`/admin/reviewers`: add a person (name, email, highlight colour). Colour is theirs on every article.

Grant an article from that directory. Visibility:

- **Own only** — they see their comments and suggestions
- **All reviewers** — they see everyone’s

**Copy invite** mints a login URL (optionally deep-linked to one article) and replaces the previous URL. Send it in chat; v1 does not email invites. Rotate the same way if a link was forwarded.

A leaked personal login is that person until you rotate. Revoke a grant to take one article away.

## Accept and reject

Open the article. Suggestions are painted in each reviewer’s colour. Accept/Reject in the bottom bar apply to the suggestion under the caret. Overlapping suggestions on the same passage show in the side panel; **Accept & reject others** is the bulk action. Accepting Alice’s rewrite will detach Bob’s on that sentence — that is expected; the outdated panel explains it.

Detached items keep the original quote and a heading/paragraph hint. Re-attach by selecting a new passage and confirming.
