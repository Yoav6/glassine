# Glassine documentation

Glassine is a self-hosted markdown review app. Authors host `.md` documents, invite named reviewers, and accept or reject suggested edits. Comments and unaccepted suggestions never enter the document file.

| Doc | Contents |
| --- | --- |
| [Install](install.md) | Local dev, Docker Compose, Caddy, env vars |
| [Architecture](architecture.md) | One-way parse, quote anchors, single write path |
| [Author](author.md) | Passkey setup, upload, grants, accept/reject |
| [Reviewers](reviewers.md) | Invite links, suggestion mode, comments |
| [Notifications](notifications.md) | The bell, email digests, SMTP setup |
| [Git adapter](git-adapter.md) | Optional Obsidian/git Compose profile |
| [Development](development.md) | Tests, schema, out of scope for v1 |
| [Dependencies](dependencies.md) | Dependabot, cooldown, audits, updating an installation |

Commands in these docs run from the repository root, the folder that holds `package.json`.

License: [AGPL-3.0](../LICENSE).
