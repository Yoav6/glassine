# Reviewer guide

You receive a personal login URL (sometimes pointed at one document). Click **Open my reviews**. After that, the same session can open every document you have been granted. Bookmark the site; if you lose the link, ask the author to copy it again.

If this browser also has another login (the author, or a different reviewer), Glassine asks which account to use each time you open a tab — including a second tab while the first is still open. Closing a tab forgets that tab’s choice; reloading does not. The navbar menu lists every session on the device (even if there is only one), switches among them, and signs each one out on its own row.

## The document

You see a continuous document, not pages and not a boxed editor. The navbar **Mode** menu defaults to **Suggesting**: type anywhere and your edits are tracked as suggestions. Hover a suggestion for a moment to get a small bar: comment to reply on that suggestion, X to reject it (including to take back a suggestion you already made). Select text to get the same bar with only the comment icon, and leave a thread on that passage. **Reply** on an existing comment continues that thread. **Suggesting (clean)** tracks the same suggestions but shows them as if you were editing directly: your insertions carry no highlight and your deletions are simply gone from view, so nothing looks marked up while you write. Your comments still show as comments in this mode, and the author still sees your edits as pending suggestions either way. **Reading** hides comments and suggestions so the document is just the hosted file. **Reading (modified)** is the same, except it reads as if every suggestion you are allowed to see had been accepted — not suggestions from reviewers your grant hides. **Editing** is greyed out; only the author can use it. **Rich text** (default) and **Source** switch the surface in any mode: rich text shows footnotes as a superscript `1` that shares one note body; source shows the markdown, including `[^1]:`.

Your suggestions and comments are yours unless the author granted you visibility of others; you always see the author’s. You can reply to anything you can see, but only retract your own: reject your own suggestions, or resolve a comment thread you started as long as nobody has replied to it. Accepting is the author’s alone. The navbar **Annotations** button lists everyone whose annotations you may see, each with an eye toggle. Even when you may see more, only your own and the author’s are shown until you turn others on; you can hide your own or the author’s too. The choice is remembered in this browser for that document. Hiding is only about what you see, never about what is saved: while your own annotations are hidden, what you type still becomes a suggestion for the author, but on your screen your insertions are gone, your deletions read as if you had never touched that text, and your own comments show no highlight or card — there is no hover bar on any of it either. This is different from **Suggesting (clean)**: hiding conceals your own annotations entirely, while clean mode only changes how they look, and your comments keep showing there. If both are on at once, hiding wins for suggestions. Turn your annotations back on and everything reappears, marked, without reloading. Status stays on the viewport while the document scrolls. If the author titles documents from the file name or a YAML property, that title appears as a heading at the top; you can comment and suggest on it the same way as the rest of the document.

If the hosted file changes (the author edits, accepts a suggestion, or git syncs), the page picks up the new text immediately and stays where you were reading. Unaccepted suggestions and comments stay in the review, not in the file.

Dark mode is the default. Authors can switch to light in Settings; the choice is stored in this browser.

## Notifications

The bell in the top bar shows when someone replies to one of your threads, and
when the author accepts, rejects or resolves your work. Clicking an item opens
that thread in the document.

If you have an email on file and the instance has email set up, a reply also reaches you by mail — batched, so
one working session by the author arrives as one message rather than a dozen, and
skipped entirely if you already read it in the app. Accepts, rejects and resolves
never send mail on their own; they are summarised inside a message a reply
triggered. You are not notified when the author edits a passage you had commented
on, even though that detaches your comment.

## Lost access

Clearing cookies or a new phone still works: open the same invite URL again. If the author rotated the link because it was forwarded, ask them for a new copy. There is no self-serve “email me my link” in v1.
