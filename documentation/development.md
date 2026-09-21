# Development

```sh
cd glassine
npm run test:unit -- --run
npm run check
npm run audit:deps
npm run dev
```

CI runs the same checks plus Playwright and a production image build on every pull request. Dependency updates arrive as Dependabot pull requests; the policy, the ProseMirror `overrides` caveat and the compromised-package procedure are in [dependencies.md](dependencies.md).

Unit tests cover the markdown pipeline (including a fixture that reuses `[^1]`), extraction of suggestion marks into quote selectors, and the anchor/rebase cascade (case A detach vs case B move). Playwright hits the author login page, unauthenticated redirects, invite POST confirm, and choosing between two reviewer sessions on one device.

`prosemirror-suggest-changes` 0.1.9 is vendored at `vendor/prosemirror-suggest-changes` (commit `653fba7`) because npm’s tarball stops at 0.1.8 and git does not ship `dist/`. `preventJoin` is required so adjacent marks from different reviewers do not merge.

## Layout of the code

| Path | Role |
| --- | --- |
| `src/lib/md` | remark → ProseMirror + PositionMap + footnote schema |
| `src/lib/anchor` | selector, resolve, surgical apply |
| `src/lib/editor` | suggest-changes wiring, extract, hydrate, join-preview |
| `src/lib/server/write.ts` | lock, snapshot, rebase, SSE, git commit |
| `src/lib/server/invite-plugin.ts` | reusable invite redeem |
| `scripts/cli.ts` | `init-env [--git] [--loopback]`, `author-setup-link`, `create-reviewer` |

## v1 is deliberately incomplete

Not in v1: reply-by-email, reviewer self-serve recovery mail, fuzzy re-anchoring, real-time co-editing, a formatting toolbar, named footnotes and inline `^[…]`, wikilink image embeds, folder/vault sync, a replacement sanitizer on accept.

R13 in v1 is the write rule: comments and unaccepted suggestions never enter the `.md`. You accept the visible plain-text replacement.
