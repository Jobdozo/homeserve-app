#!/usr/bin/env bash
# One-time (safe to re-run) setup of the nightly backup on the VPS.
#   cd /tmp/homeserve-deploy && git pull && bash deploy/install-backup.sh
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Run as root."; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 755 "$here/backup-data.sh" /usr/local/bin/tikdum-backup

# Tools for the encrypted off-server copy.
command -v openssl > /dev/null || apt-get install -y openssl
command -v rclone > /dev/null || apt-get install -y rclone

# Encryption passphrase for the off-server copy (created once, never overwritten).
KEY=/root/.tikdum-backup-key
if [ ! -s "$KEY" ]; then
  umask 077
  openssl rand -base64 48 > "$KEY"
  echo "Created the backup encryption key: $KEY"
fi
chmod 600 "$KEY"

# Settings file (created once; edit it to switch on the off-server copy).
CONF=/etc/tikdum-backup.conf
if [ ! -f "$CONF" ]; then
  umask 077
  cat > "$CONF" <<'EOF'
# Tikdum backup settings. Lines starting with # are ignored.
BACKUP_ENCRYPT_KEY_FILE=/root/.tikdum-backup-key

# --- Off-server copy to Supabase Storage (fill in the two keys, then remove the # signs) ---
# Create the keys in Supabase: Project Settings -> Storage -> S3 Connection -> New access key.
# BACKUP_RCLONE_REMOTE=supabase:tikdum-backups
# RCLONE_CONFIG_SUPABASE_TYPE=s3
# RCLONE_CONFIG_SUPABASE_PROVIDER=Other
# RCLONE_CONFIG_SUPABASE_ENDPOINT=https://kayolbcjmmzwoxbdpjvz.storage.supabase.co/storage/v1/s3
# RCLONE_CONFIG_SUPABASE_REGION=ap-northeast-1
# RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID=PASTE_ACCESS_KEY_ID_HERE
# RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY=PASTE_SECRET_HERE
EOF
  echo "Created $CONF"
fi
chmod 600 "$CONF"

# 02:30 every night, server time (UTC).
cat > /etc/cron.d/tikdum-backup <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * root /usr/local/bin/tikdum-backup >> /var/log/tikdum-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/tikdum-backup

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
set +e
/usr/local/bin/tikdum-backup | tee -a /var/log/tikdum-backup.log
status=${PIPESTATUS[0]}
set -e
echo
echo "Backups: /root/tikdum-backups (daily/ and weekly/).  Log: /var/log/tikdum-backup.log"
echo
echo "IMPORTANT — save the encryption key somewhere safe OUTSIDE this server (password manager):"
echo "    cat $KEY"
echo "Without it the encrypted off-server backups cannot be opened, and if this server is lost the key is lost too."
exit "$status"
