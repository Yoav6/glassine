# Notifications and email

Glassine tells people when something happened on a document they are part of.
Every notification appears in the app immediately, in the bell in the top bar.
Some of them also become an email.

Email is optional. With `SMTP_URL` unset, everything on this page still works —
in the app only.

## What creates a notification

| Event | Who is told |
| --- | --- |
| A reviewer leaves a comment or a suggestion | The authors |
| Anyone replies in a thread | Everyone else already in that thread |
| A suggestion is accepted or rejected | Whoever made the suggestion |
| A thread is resolved | Everyone in the thread |

Two things deliberately create no notification:

- **A top-level comment by an author.** Notifying every granted reviewer each
  time the author works through a document would be noise.
- **An annotation losing its anchor.** When the author edits a passage someone
  had commented on, the comment detaches. Reviewers are not told: chasing a
  detached anchor is confusing and slow, and repairing it is the author's job.

Reopening a resolved thread is not news either, so only the resolve notifies.
If the author accepts a suggestion and then undoes it, the queued notification
is withdrawn rather than followed by a contradicting one.

### Notifications obey the visibility rules

A notification is filtered by the same predicate as a read. A reviewer whose
grant is on the default scope sees only their own annotations and the author's,
so they are never told that another reviewer replied in a thread they share —
that would leak the other reviewer's participation. This is the same
`visibleAuthorIdsForViewer` check the document API uses, and it is covered by
`src/lib/notify.spec.ts`.

## What creates an email

Only **comments, suggestions and replies** can cause an email to be sent. Accepts,
rejects and resolves are *passengers*: they show up in the bell right away, and
they are summarised at the end of the next email that something else triggered,
but on their own they never send anything.

So an author working through a document — accepting twelve suggestions, rejecting
three, resolving two threads — mails nobody. The next time they reply to one of
those reviewers, that reviewer's email ends with:

```
Also since your last email:
  - 12 suggestions accepted, 3 rejected
  - 2 threads resolved
```

## Pacing: how one email covers a whole session

A notification is written to the database the moment it happens. A background
ticker decides, once a minute, whether it is time to mail anything.

For each person with something waiting:

1. **Wait until the actor goes quiet.** If the newest pending item is less than
   `NOTIFY_QUIET_MINUTES` old (default 10), nothing is sent. A reviewer leaving
   twenty suggestions and six comments over twelve minutes produces twenty-six
   notifications and exactly one email, ten minutes after their last edit.
2. **Unless it has waited long enough already.** Once the oldest pending item is
   `NOTIFY_MAX_DELAY_MINUTES` old (default 60), the email goes out regardless, so
   a continuously active reviewer cannot defer it forever.
3. **Never more often than `NOTIFY_MIN_GAP_MINUTES`** (default 5) per person.
4. **Skip anything already read.** If you opened the app and read the reply before
   the timer fired, it is dropped from the email rather than duplicated into your
   inbox. This is usually the largest reduction of the four.

Nothing older than 24 hours is mailed. That keeps a backlog from firing all at
once when email is switched on for the first time, or after a long outage; the
notifications stay in the bell either way.

A send that fails is retried with exponential backoff, and the rows stay queued
so nothing is lost across a restart. After eight failed attempts the email is
abandoned with a logged error — a dead SMTP configuration cannot wedge the queue.

### Reviewers without an email

A reviewer's email is optional (`/admin/reviewers`, or `npm run cli
create-reviewer "Name"` with no address). Nothing about notifications changes
for them except the very last step: everything still runs — recipient
selection, in-app bell rows, the queued digest — but the dispatcher checks for
an address immediately before sending and simply skips the send if there isn't
one. The queued rows are left exactly as they were, not marked sent, failed, or
stale (until the ordinary 24-hour staleness rule catches up with them like any
other notification). Add an email to that reviewer later and the next
dispatcher tick sends the backlog through the same pacing rules as anyone
else's — there is no separate step to "turn mail on" for them.

## Configuring email

Set two variables in `.env`:

```sh
SMTP_URL=smtps://user:pass@smtp.example.com:465
MAIL_FROM=Glassine <glassine@example.com>
```

Then open **Admin → Settings** and press **Send a test email**. It checks the
connection before sending and mails the author address, so a typo shows up as an
error on the page rather than as silence.

Notification links are absolute and built from `PUBLIC_ORIGIN`. If that is wrong,
every link in every email is wrong, so the settings page prints the origin the
test email used — check it matches the address you actually use.

### Testing without sending real mail

Real-world deliverability and a fast local test loop are different needs, and
the setup toggles between them with one env var swap — nothing else in the
stack changes.

**Local, no account needed: [Mailpit](https://mailpit.axllent.org).** It's a
fake SMTP server that catches every message the app sends instead of
delivering it, with a web inbox at `http://localhost:8025` so you can see the
real rendered email, subject, and headers.

```sh
docker compose --profile mail up -d mailpit
```

Point `SMTP_URL` at it in `.env`:

```sh
SMTP_URL=smtp://localhost:1025    # a host-run `npm run dev`
# or, for the Compose app container (same network, reaches Mailpit by name):
SMTP_URL=smtp://mailpit:1025
MAIL_FROM=Glassine <glassine@localhost>
```

Restart (`npm run dev` picks up `.env` changes automatically; a Compose `app`
container needs `docker compose up -d app`). Trigger a notification and watch
it appear at `localhost:8025` — nothing leaves the machine, and there's no
provider account or domain to set up.

`mailpit`'s ports are bound to `127.0.0.1` only, so leaving the `mail` profile
on by accident never exposes it beyond the host. It's a dev/test tool: never
enable it on a real deployment, since messages are only captured, not
delivered.

**Real-world, when you want to check actual delivery: swap in a real
provider.** Replace the two lines above with a provider's SMTP credentials
(see below) and restart — same app, same code path, nothing else to change.
Mailpit and a real provider are never both needed at once; switch between them
by editing `SMTP_URL`/`MAIL_FROM`.

### Which provider

Use a transactional email provider's free tier: Resend, Brevo, Mailgun and
Postmark all work and all speak SMTP. Do not run a mail server on the VPS. Cloud
address space is listed on the Spamhaus PBL by default, Microsoft blocks at
subnet level with a listing that does not auto-expire, full forward-confirmed
reverse DNS is required rather than just a PTR, and many providers block outbound
port 25 to begin with. That is real work to save a few dollars a month.

Publish the SPF, DKIM and DMARC records your provider generates, with DMARC at
`p=none`. It takes about fifteen minutes and it is the difference between the
inbox and the spam folder.

If your host blocks outbound mail ports, prefer 465 (`smtps://`) or your
provider's alternative port, often 2525.

## Not in v1

- **Per-person preferences.** Everyone gets the same pacing, and there is no
  unsubscribe link — with no preference page there is nowhere honest to point one.
  When preferences land, add a `List-Unsubscribe` header at the same time.
- **Reply by email.** Replying to a notification does nothing. Replies are written
  in the app.
