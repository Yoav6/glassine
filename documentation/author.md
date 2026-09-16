# Author guide

## First login

1. On first boot the app seeds `AUTHOR_EMAIL` with `role=author`.
2. Run `npm run cli author-setup-link` (or `docker compose exec app npm run cli author-setup-link`).
3. Open the URL, redeem it, register a passkey. Register a second authenticator when you can.

Later logins: `/login` → **Sign in with passkey**. Email OTP appears only if `SMTP_URL` and `MAIL_FROM` are set.

## Articles

`/admin` lists hosted articles. Upload a `.md`. The first heading becomes the title when present. Download is always available (`Download .md` on the article, or the same bytes the adapter would export).

The article editor is the same WYSIWYG surface reviewers use, with Suggest on. Your typing is saved as surgical substitutions into the file — not as pending annotations. Reviewer suggestions already on the page are left pending until you Accept or Reject them.

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
