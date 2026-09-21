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

Every mutation of a hosted `.md` goes through `commitWrite` under a per-document lock: author save, accept, upload, and the git adapter. Each write snapshots `document_version`, rebases live annotations, and broadcasts `base-moved` over SSE. Open document views apply the new base in place (no reload, scroll and caret kept) except when the event is from that tab’s own save. While a document is open the server also `git fetch`es about once a second, so an Obsidian push still lands if the hook never reached the app.

Author **Editing** types into the document directly — suggestion tracking is off. Each transaction is mapped onto a working copy of the `.md` (quote substitutions on the rich-text surface; the source surface serializes the buffer). Autosave posts that copy through `commitWrite`. Reviewer marks already on the page stay pending until you Accept or Reject them. After a successful save the editor remaps from the new file so the position map stays aligned. **Suggesting** still intercepts typing as tracked changes and posts those marks as pending annotations. **Reading** hydrates neither comments nor suggestions and leaves the editor non-editable. **Reading (modified)** hydrates the viewer’s visible suggestions, accepts those marks locally, and still leaves the editor non-editable — annotations the grant hides never enter that preview. **Source** is the same document and the same write path, parsed as a single preformatted block instead of markdown.

## Visibility

Isolation is a `WHERE` clause on the annotation author. A grant stores `default` (the reviewer and the author; grants written as `own` before the split read the same), `all`, or `custom:` followed by user ids. A reviewer's own annotations are always included. The grant also keeps the last `custom:` list in `customScope` while it sits on `default`, so switching back restores the selection. The author sees the union. Replying to, resolving or moving an annotation is refused when the viewer cannot see it; reviewers may only resolve their own threads (and only while unreplied) or move their own annotations, and only the author accepts. Which of the visible people a viewer wants on screen is a separate, per-browser choice (the **Annotations** menu; by default everyone for the author, only themselves and the author for a reviewer), kept in `localStorage`. Reviewer colour is a user field, stable across documents.

## Auth

Better Auth issues the session cookie (`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS). Reviewers redeem a **reusable hashed invite** with a POST (“Open my reviews”) so a scanner GET does not mint a session. Authors use passkeys; `role=author` is checked on every mutating route, not “they loaded `/admin`”. `disableSignUp` is on. There is no public signup.

A browser can keep several sessions at once (author plus a reviewer, or two reviewers). Opening the site then asks which account to use. That choice is stored for the current tab only — close the tab, or open another tab, and the chooser is back, even if the browser stays open. Reloading the same tab keeps the chosen account. The navbar menu lists every session on the device (even if there is only one) and signs each one out separately.
