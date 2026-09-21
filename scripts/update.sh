#!/usr/bin/env bash
# Update a deployed Glassine installation to the current `main`.
#
# This is the installation half of the dependency story. Dependabot and CI
# decide *which* versions are safe (see documentation/dependencies.md); this
# script is how a running instance picks that decision up. It deliberately does
# not resolve new package versions itself — the image is rebuilt with `npm ci`
# from the reviewed package-lock.json, so two installations updated from the
# same commit run byte-identical dependencies.
#
#   ./scripts/update.sh           update to the latest reviewed commit
#   ./scripts/update.sh --check   report whether an update is available, change nothing
#   ./scripts/update.sh --no-backup
#
# Exit codes: 0 up to date or updated, 1 error, 2 update available (--check only).

set -euo pipefail

cd "$(dirname "$0")/.."

CHECK_ONLY=0
BACKUP=1
for arg in "$@"; do
	case "$arg" in
		--check) CHECK_ONLY=1 ;;
		--no-backup) BACKUP=0 ;;
		-h|--help) awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
		*) echo "unknown option: $arg" >&2; exit 1 ;;
	esac
done

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose is not available"
[ -f compose.yaml ] || die "run this from a Glassine checkout (compose.yaml not found)"

# A dirty tree means someone edited this installation in place. Rebuilding would
# either clobber that or bake it in; both deserve a human. `--check` writes
# nothing, so it is allowed to report from a dirty tree.
if [ "$CHECK_ONLY" -eq 0 ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
	die "working tree has uncommitted changes; commit or discard them first"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "fetching origin/$BRANCH"
git fetch --quiet origin "$BRANCH"

CURRENT="$(git rev-parse HEAD)"
TARGET="$(git rev-parse "origin/$BRANCH")"

if [ "$CURRENT" = "$TARGET" ]; then
	log "already up to date ($(git rev-parse --short HEAD))"
	exit 0
fi

echo
git --no-pager log --oneline "$CURRENT..$TARGET"
echo

if [ "$CHECK_ONLY" -eq 1 ]; then
	log "update available: $(git rev-parse --short "$CURRENT") -> $(git rev-parse --short "$TARGET")"
	exit 2
fi

# --ff-only refuses anything that is not a straight advance of the reviewed
# history, so a force-pushed or rewritten remote stops here instead of being
# merged in silently.
log "updating $(git rev-parse --short "$CURRENT") -> $(git rev-parse --short "$TARGET")"
git merge --ff-only "origin/$BRANCH"

# Build before stopping anything: a failed build then costs no downtime, and the
# old containers keep serving.
log "building image"
if ! docker compose build --pull; then
	log "build failed; rolling back to $(git rev-parse --short "$CURRENT")"
	git reset --hard --quiet "$CURRENT"
	die "build failed, nothing was restarted"
fi

DATA_DIR_PATH="${DATA_DIR:-./data}"
if [ -f .env ]; then
	FROM_ENV="$(grep -E '^DATA_DIR=' .env | tail -1 | cut -d= -f2- || true)"
	[ -n "$FROM_ENV" ] && DATA_DIR_PATH="$FROM_ENV"
fi

if [ "$BACKUP" -eq 1 ] && [ -d "$DATA_DIR_PATH" ]; then
	STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
	ARCHIVE="glassine-data-$STAMP.tar.gz"
	log "stopping app and backing up $DATA_DIR_PATH to $ARCHIVE"
	docker compose stop app >/dev/null
	tar -czf "$ARCHIVE" -C "$(dirname "$DATA_DIR_PATH")" "$(basename "$DATA_DIR_PATH")"
else
	log "skipping data backup"
fi

log "starting"
docker compose up -d

# An update that builds and starts can still be broken. Give it a moment, then
# ask the app itself.
log "waiting for the app to answer"
HEALTHY=0
for _ in $(seq 1 30); do
	if docker compose exec -T app wget --quiet --spider http://127.0.0.1:3000/login 2>/dev/null; then
		HEALTHY=1
		break
	fi
	sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
	log "the app did not answer; rolling back to $(git rev-parse --short "$CURRENT")"
	git reset --hard --quiet "$CURRENT"
	docker compose up -d --build
	echo
	die "rolled back. Recent logs:
$(docker compose logs --tail 40 app 2>&1)"
fi

log "updated to $(git rev-parse --short HEAD) and healthy"
if [ "$BACKUP" -eq 1 ] && [ -n "${ARCHIVE:-}" ]; then
	log "pre-update data backup: $ARCHIVE (delete it once you are satisfied)"
fi
