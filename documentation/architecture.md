# Architecture

Glassine is Architecture B from the research: a living markdown file plus database annotation rows. Three invariants keep the system small.

## One-way parse

`src/lib/md` walks remark/mdast into a ProseMirror document and a `PositionMap` of `{docPos, srcOffset, len}` segments. `docToSrc` / `srcToDoc` are binary searches. Nothing serializes a full editor document back to markdown.

Numbered footnotes are real schema nodes: one `footnote` body and N `footnote_ref` superscripts. Several `[^1]` sharing one `[^1]:` is required. A comment on one superscript does not attach to the others; a suggestion inside the note body edits the single definition.

## Quote anchors

`src/lib/anchor` stores W3C TextQuoteSelectors (`exact`, ~32 chars of `prefix`/`suffix`, an offset hint) plus a heading path and paragraph ordinal. Resolve is a two-strategy cascade:

1. Stored offsets still contain `exact`
2. `indexOf` nearest the old offset, disambiguated by prefix/suffix

Otherwise the row is marked `detached` — never fuzzy, never deleted. Attachment is independent of lifecycle: an `open` or `resolved` annotation can be attached or detached. Surgical apply splices one range and refuses when the quote is ambiguous.

## Single write path

Every mutation of a hosted `.md` goes through `commitWrite` under a per-document lock: author save (suggestion marks auto-accepted), accept, upload, and the git adapter. Each write snapshots `document_version`, rebases live annotations, and broadcasts `base-moved` over SSE. Open reviewer sessions see a banner; the editor does not yank the document out from under someone who is typing.

Author **Editing** mode is suggestion mode with auto-accept on save. That is the same extraction and `applySubstitution` path, without a pending review state. Only **new** suggestion marks from the author are applied; existing reviewer marks stay pending. After a successful save the editor reloads from the new file so the position map stays aligned. Authors can also switch to **Suggesting**, which posts their marks as pending annotations like a reviewer. **Reading** hydrates neither comments nor suggestions and leaves the editor non-editable. **Reading (modified)** hydrates the viewer’s visible suggestions, accepts those marks locally, and still leaves the editor non-editable — annotations the grant hides never enter that preview.

## Visibility

Isolation is a `WHERE` clause. Grants store `own` (default), `all`, or a list of reviewer ids. The author sees the union. Reviewer colour is a user field, stable across documents.

## Auth

Better Auth issues the session cookie (`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS). Reviewers redeem a **reusable hashed invite** with a POST (“Open my reviews”) so a scanner GET does not mint a session. Authors use passkeys; `role=author` is checked on every mutating route, not “they loaded `/admin`”. `disableSignUp` is on. There is no public signup.

A browser can keep several sessions at once (author plus a reviewer, or two reviewers). Opening the site then asks which account to use. That choice is stored for the current tab only — close the tab, or open another tab, and the chooser is back, even if the browser stays open. Reloading the same tab keeps the chosen account. The navbar menu lists every session on the device (even if there is only one) and signs each one out separately.
