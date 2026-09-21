# syntax=docker/dockerfile:1

# Base images are pinned by digest, not just by tag: a tag can be repointed at
# different content under the same name. Dependabot (.github/dependabot.yml)
# rewrites the tag and the digest together when a newer image is published.
FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor

# `npm ci` installs exactly what package-lock.json records, so an image rebuild
# cannot silently pick up a version nobody reviewed. `--ignore-scripts` closes
# the main npm malware path: install/postinstall hooks that run arbitrary code
# during the build. Only esbuild genuinely needs its hook (it selects the
# platform binary), so it is rebuilt by name. Adding a package here is a
# deliberate decision, not a default. See documentation/dependencies.md.
RUN npm ci --ignore-scripts \
	&& npm rebuild esbuild

COPY . .
# Normally run by the `prepare` script, which --ignore-scripts skipped.
RUN npx svelte-kit sync
# Runtime secrets are injected by Compose. This placeholder only satisfies module
# init during `vite build`; it is not copied into the final image.
ENV BETTER_AUTH_SECRET=build-placeholder
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85
# git: the app commits accepted edits and uploads to DATA_DIR/documents itself
# when the git adapter is on (src/lib/server/git.ts runs the git binary).
RUN apk add --no-cache libc6-compat git
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
# adapter-node rejects request bodies over 512K by default, which is too small
# for an image uploaded from /admin. 2M covers the images an article normally
# carries. The limit is on the whole request, so a file just under 2 MiB fits.
# Override per installation with BODY_SIZE_LIMIT in the container environment.
ENV BODY_SIZE_LIMIT=2M
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/vendor ./vendor
COPY --from=builder /app/tsconfig.json ./
# Run as the image's unprivileged `node` user (uid 1000), not root. The app code
# above stays root-owned and read-only to it; the only place it writes is
# DATA_DIR. Creating and owning /data here means a Docker-managed volume mounted
# there inherits that ownership. A host directory bind-mounted there does not:
# it must already be writable by the uid the container runs as (see
# documentation/install.md, and `init-env`, which creates it).
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "build"]
