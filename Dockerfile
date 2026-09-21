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
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/vendor ./vendor
COPY --from=builder /app/tsconfig.json ./
EXPOSE 3000
CMD ["node", "build"]
