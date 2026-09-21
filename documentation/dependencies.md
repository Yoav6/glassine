# Dependencies

Glassine runs 350 npm packages it did not write. The realistic threat is not a
bug in one of them; it is a maintainer account getting phished and a trojanized
version being published under a name already in `package.json`. That is how the
`chalk`/`debug` compromise and the Shai-Hulud worm spread in 2025, and GitHub
now catalogs roughly eighteen malicious npm packages a day.

The defense has two halves, and they pull in opposite directions:

- **Updating** closes known holes. Stale dependencies are the ordinary way apps
  get owned.
- **Not updating immediately** closes the malware window. Malicious releases are
  short-lived — axios, `ua-parser-js`, Solana `web3.js` and Ledger Connect Kit
  were all yanked within hours. Whoever installs during those hours loses.

So updates are proposed automatically, delayed deliberately, tested before they
are accepted, and only then shipped to installations. Nothing resolves a new
package version on an installation's machine.

## The chain

| Stage | What runs | Where |
| --- | --- | --- |
| Propose | Dependabot, weekly, after a cooldown | [`.github/dependabot.yml`](../.github/dependabot.yml) |
| Verify | Build, `svelte-check`, unit tests, Playwright, image build | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| Watch | Daily `npm audit` + lockfile hygiene, opens an issue on failure | [`.github/workflows/supply-chain.yml`](../.github/workflows/supply-chain.yml) |
| Accept | Routine updates auto-merge once checks pass; everything else a human merges | [`.github/workflows/dependabot-automerge.yml`](../.github/workflows/dependabot-automerge.yml) |
| Ship | `scripts/update.sh` rebuilds the image from the merged lockfile | Each installation |

### Propose — Dependabot

Dependabot opens pull requests against `main` for npm packages, both Dockerfiles,
the images in `compose.yaml`, and the actions used by the workflows themselves.

The setting that matters for malware is `cooldown`: a release must have been
public for seven days (fourteen for a major) before Dependabot will propose it.
Short-lived malicious publishes are gone from the registry before the waiting
period elapses, so they never become a pull request here. GitHub applies three
days by default; this repository waits longer because nothing here is urgent.

Security updates for *published advisories* bypass cooldown and open
immediately, which is correct — the flaw is already public, so delay only helps
an attacker.

Related packages are grouped so they move together and land in one pull request:

- `prosemirror-*` and `@handlewithcare/*`. **These also appear in the
  `overrides` block of `package.json`**, which pins four packages to exact
  versions so the vendored `prosemirror-suggest-changes` resolves against a
  single copy of each. Dependabot rewrites those exact pins along with the
  dependencies (it did so in the first ProseMirror pull request), but confirm
  that in the diff: the four `overrides` lines and the four matching
  `dependencies` lines must name the same versions. A mismatch makes `npm ci`
  fail in CI with an override conflict rather than installing something
  surprising.
- `better-auth` and `@better-auth/*`, which are pinned to one exact version and
  are only supported in lockstep.
- The Svelte and Vite toolchain.
- Everything else: one grouped pull request for minor and patch, individual pull
  requests for majors so each gets read on its own.

### Accept — what merges itself, and what does not

Auto-merge is the mechanism these attacks are designed to exploit, so it is
limited to the cases where a compromised release is least likely to matter and
where every other layer still applies. A pull request merges itself only when
**every** package in it is either:

- an npm **patch** update, or
- an npm **minor** update to a `devDependency`,

and none of them is in the auth and data stack (`better-auth`, `@better-auth/*`,
`drizzle-*`), a native module (`better-sqlite3`), or the ProseMirror pins.
GitHub then holds the merge until `verify` and `docker` pass. The decision logic
lives in `dependabot-automerge.yml` and fails closed: an unparseable or empty
payload means "do not merge".

Everything else stays open for a human: major versions, minor updates to
runtime dependencies, Docker and compose images (CI builds them but cannot run
them), GitHub Actions, and anything CI rejected. For those, read the diff; for
anything that is not a routine bump, skim the upstream changelog and the
release's file list.

Two things keep this from being a blind trust in the registry. The seven-day
cooldown means a release has been public for a week before it can even become a
pull request. And merging to `main` deploys nothing: installations only change
when someone runs `scripts/update.sh`, which is the second checkpoint. Run
`./scripts/update.sh --check` first and read the commit list it prints.

Requires the repository setting **Settings → General → Allow auto-merge**, and
the "Protect main" ruleset requiring `verify` and `docker`. Without the ruleset,
auto-merge would merge immediately instead of waiting for the checks.

### Verify — CI

Every pull request, including every Dependabot pull request, must pass:

- `npm ci --ignore-scripts`, which installs exactly what `package-lock.json`
  records, refuses to run if the lockfile and `package.json` disagree, and uses
  the same flags as the Dockerfile so CI exercises the install production
  performs
- unit tests and the Playwright suite
- a production `docker build`, because a lockfile that tests green can still
  fail to produce a working image

`npm run check` also runs, but is currently marked `continue-on-error` because
`main` has three pre-existing `svelte-check` errors (`src/lib/editor/extract.ts`
line 379 and two in `src/lib/editor/links.spec.ts`). A gate that is red before
anyone touches it teaches you to ignore it. Fix those three and remove
`continue-on-error` from `ci.yml`, so a dependency update that breaks types
stops there.

### Watch — the daily audit

Dependabot answers "is there something newer?" once a week. The supply-chain
workflow answers "is what we ship known to be bad?" every day:

- `npm audit --omit=dev --audit-level=high` fails the run on a high or critical
  advisory in anything npm considers reachable from production dependencies.
  That is slightly wider than "what is in the image": `better-auth` declares
  `@sveltejs/kit`, `drizzle-kit` and `vitest` as optional peer dependencies, so
  npm counts them even though `package.json` lists them under
  `devDependencies` and they are pruned from the final image. The gate errs
  toward failing; if one of those turns out to be a false alarm, that is a
  decision to make by reading the advisory, not by narrowing the check.
  A second, report-only audit covers the full tree and emits a warning.
- `scripts/check-lockfile.mjs` verifies that every entry in `package-lock.json`
  resolves to `registry.npmjs.org` and carries an integrity hash. A tampered
  lockfile that points at an attacker's tarball is invisible in a 170,000-line
  JSON diff but obvious to this check.

Both run locally too:

```sh
npm run audit:deps      # runtime advisories + lockfile hygiene
npm run audit:lockfile  # lockfile hygiene alone
```

A failing *scheduled* run opens an issue, so a problem found at 05:30 on a
Sunday is not just a red mark in a tab nobody has open.

### Ship — installations

An installation updates by rebuilding from a reviewed commit:

```sh
cd glassine
./scripts/update.sh          # or: npm run update
./scripts/update.sh --check  # report only; exit 2 means an update is waiting
```

It fast-forwards to `origin/main`, rebuilds the image, backs up `DATA_DIR`
before restarting, waits for the app to answer, and rolls back to the previous
commit if it does not. `--ff-only` means a force-pushed or rewritten remote
stops the update instead of being merged in quietly.

To check daily and mail the machine's owner when something is waiting:

```cron
30 6 * * * cd /srv/glassine && ./scripts/update.sh --check
```

Applying updates unattended is a deliberate non-default. This app holds the
only copy of a document and its review history; an update that fails in a way
the health check does not catch is worse than an update that waits a day for a
person. If you want it anyway, drop `--check` and read the mail.

## Why installations do not update packages themselves

The obvious-looking version of "keep dependencies fresh everywhere" is to run
`npm update` or `npm install` during the Docker build so every install gets the
newest packages. That inverts the protection:

- It discards the lockfile, which is the record of *what was reviewed*.
- It resolves versions at build time on each machine, so two installations built
  an hour apart run different code and a bug report cannot be reproduced.
- It installs whatever is newest **at that moment** — including a malicious
  release published ten minutes ago, which is precisely the window cooldown
  exists to skip.

The builds here use `npm ci`, which installs the exact tree in
`package-lock.json` and nothing else. Freshness comes from the reviewed commit
moving forward, not from the build resolving new versions.

## Image hardening

- Both Dockerfiles and the `compose.yaml` images pin a **digest**, not just a
  tag — a tag can be repointed at different content under the same name.
  Dependabot rewrites the tag and the digest together.
- The builder runs `npm ci --ignore-scripts`, which blocks `install` and
  `postinstall` hooks. Those hooks are the main way npm malware executes, and
  they run with the builder's full privileges. Only `esbuild` genuinely needs
  its hook (it selects the platform binary), so it is rebuilt by name:
  `npm rebuild esbuild`. Adding a package to that line should be a decision, not
  a reflex. `svelte-kit sync`, normally run by the `prepare` script, is invoked
  explicitly for the same reason.

## When a dependency is compromised

1. Check whether the bad version is actually installed:
   `npm ls <package>` and `grep '"<package>"' package-lock.json`. Cooldown means
   the answer is usually no.
2. If it is: pin the last good version in `package.json`, run `npm install`,
   commit the lockfile, and run `./scripts/update.sh` on every installation.
3. Treat anything the builder could reach as exposed. Rotate
   `BETTER_AUTH_SECRET`, `GIT_HTTP_TOKEN` and `GIT_SYNC_SECRET`, and any npm or
   GitHub token that was present on a machine that ran an install.
4. Reviewer sessions are passkey-backed and do not survive a secret rotation, so
   expect people to sign in again.
