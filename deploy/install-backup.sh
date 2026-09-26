#!/usr/bin/env bash
# One-time (safe to re-run) setup of the daily data backup on the VPS.
#   bash /tmp/homeserve-deploy/deploy/install-backup.sh
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Run as root."; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 755 "$here/backup-data.sh" /usr/local/bin/tikdum-backup

# 02:30 every night, server time.
cat > /etc/cron.d/tikdum-backup <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * root /usr/local/bin/tikdum-backup >> /var/log/tikdum-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/tikdum-backup

# Keep the log from growing forever.
cat > /etc/logrotate.d/tikdum-backup <<'EOF'
/var/log/tikdum-backup.log {
  monthly
  rotate 6
  missingok
  notifempty
  compress
}
EOF

echo "Installed. Running the first backup now..."
/usr/local/bin/tikdum-backup | tee -a /var/log/tikdum-backup.log
echo
echo "Backups are in /root/tikdum-backups (daily/ and weekly/). Log: /var/log/tikdum-backup.log"
echo "Next run: tonight at 02:30 (server time: $(date +%Z))."
