#!/bin/bash
set -euo pipefail
mkdir -p /data/git /data/documents
: "${GIT_HTTP_TOKEN:?GIT_HTTP_TOKEN is required}"
: "${GIT_SYNC_SECRET:?GIT_SYNC_SECRET is required}"
: "${GIT_SYNC_URL:=http://app:3000/api/adapter/sync}"

# Bind-mounted DATA_DIR is owned by the host user. HTTP receive-pack (fcgiwrap)
# and host-side `git push` from Vite must both write /data/git. Run git-http-backend
# as that owner on every start so a new machine does not hit 502 on first push.
DATA_UID="$(stat -c %u /data)"
DATA_GID="$(stat -c %g /data)"
NGINX_UID="$(id -u nginx)"
NGINX_GID="$(id -g nginx)"

# --system so nginx/fcgiwrap see this, not only root's --global config.
git config --system --add safe.directory '*'
git config --system --add safe.directory /data/documents
git config --system --add safe.directory /data/git/glassine.git

HOOK=/data/git/glassine.git/hooks/post-receive
if [ ! -d /data/git/glassine.git ]; then
  git init --bare /data/git/glassine.git
fi
git --git-dir=/data/git/glassine.git config http.receivepack true
git --git-dir=/data/git/glassine.git config http.uploadpack true
# Same uid will create objects; keep them user-writable for the next process.
git --git-dir=/data/git/glassine.git config core.sharedRepository 0644
# Push must succeed even if the app is down. Log curl failures; Glassine also
# fetches the bind-mounted origin when a document or the admin list is opened.
cat > "${HOOK}" <<EOF
#!/bin/sh
LOG=/data/git/hook.log
# New tip is in the working tree as soon as receive-pack finishes; the HTTP
# notify is only for live SSE. Connect timeout used to be 2s and silently
# dropped Vite sidecar notifies (host.docker.internal).
i=0
while [ "\$i" -lt 3 ]; do
  if curl -fsS --connect-timeout 5 --max-time 20 -X POST \\
    -H "x-glassine-sync: ${GIT_SYNC_SECRET}" \\
    "${GIT_SYNC_URL}"; then
    exit 0
  fi
  i=\$((i + 1))
  echo "\$(date -Iseconds) sync POST failed (attempt \$i)" >> "\$LOG"
  sleep 1
done
exit 0
EOF
chmod +x "${HOOK}"

set_relative_origin() {
  git -C /data/documents remote set-url origin ../git/glassine.git
}

if [ ! -d /data/documents/.git ]; then
  if [ -z "$(ls -A /data/documents 2>/dev/null)" ]; then
    git clone /data/git/glassine.git /data/documents
  else
    git clone /data/git/glassine.git /tmp/glassine-init
    mv /tmp/glassine-init/.git /data/documents/
    rm -rf /tmp/glassine-init
    git -C /data/documents -c user.email=glassine@local -c user.name=Glassine add -A
    git -C /data/documents -c user.email=glassine@local -c user.name=Glassine commit -m "import existing documents" || true
    set_relative_origin
    git -C /data/documents push origin HEAD || true
  fi
fi
if [ -d /data/documents/.git ]; then
  set_relative_origin
fi

chown -R "${DATA_UID}:${DATA_GID}" /data/git

# -m APR1 MD5: nginx auth_basic does not verify bcrypt (htpasswd default on Alpine).
htpasswd -bcm /etc/nginx/htpasswd git "${GIT_HTTP_TOKEN}"
# Socket owned by nginx; worker process is the DATA_DIR owner so receive-pack can write.
spawn-fcgi \
  -s /var/run/fcgiwrap.socket \
  -M 0660 \
  -u "${DATA_UID}" \
  -g "${DATA_GID}" \
  -U "${NGINX_UID}" \
  -G "${NGINX_GID}" \
  -- /usr/bin/fcgiwrap
exec nginx -g 'daemon off;'
