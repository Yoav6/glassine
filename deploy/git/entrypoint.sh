#!/bin/bash
set -euo pipefail
mkdir -p /data/git /data/documents
HOOK=/data/git/glassine.git/hooks/post-receive
if [ ! -d /data/git/glassine.git ]; then
  git init --bare /data/git/glassine.git
fi
git --git-dir=/data/git/glassine.git config http.receivepack true
git --git-dir=/data/git/glassine.git config http.uploadpack true
cat > "${HOOK}" <<EOF
#!/bin/sh
curl -fsS -X POST \\
  -H "x-glassine-sync: ${GIT_SYNC_SECRET}" \\
  http://app:3000/api/adapter/sync || true
EOF
chmod +x "${HOOK}"

if [ ! -d /data/documents/.git ]; then
  if [ -z "$(ls -A /data/documents 2>/dev/null)" ]; then
    git clone /data/git/glassine.git /data/documents
  else
    git clone /data/git/glassine.git /tmp/glassine-init
    mv /tmp/glassine-init/.git /data/documents/
    rm -rf /tmp/glassine-init
    git -C /data/documents -c user.email=glassine@local -c user.name=Glassine add -A
    git -C /data/documents -c user.email=glassine@local -c user.name=Glassine commit -m "import existing documents" || true
    git -C /data/documents push origin HEAD || true
  fi
fi
: "${GIT_HTTP_TOKEN:?GIT_HTTP_TOKEN is required}"
: "${GIT_SYNC_SECRET:?GIT_SYNC_SECRET is required}"
htpasswd -bc /etc/nginx/htpasswd git "${GIT_HTTP_TOKEN}"
spawn-fcgi -s /var/run/fcgiwrap.socket -u nginx -g nginx -- /usr/bin/fcgiwrap
exec nginx -g 'daemon off;'
