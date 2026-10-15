#!/usr/bin/env bash
# Switches on the nightly off-server backup copy (encrypted, to Supabase Storage) using the
# S3 keys the server already has for photos (STORAGE_S3_* in .env). No keys are printed.
#
#   cd /tmp/homeserve-deploy && git pull && bash deploy/enable-offsite-backup.sh
#
# Safe to run again: it replaces its own block in /etc/tikdum-backup.conf each time.
set -euo pipefail
cd "$(dirname "$0")/.."

CONF=/etc/tikdum-backup.conf
BUCKET="${BACKUP_BUCKET:-tikdum-backups}"
ENV_FILE=.env

[ -x /usr/local/bin/tikdum-backup ] && [ -f "$CONF" ] || { echo "Nightly backup isn't installed yet — run: bash deploy/install-backup.sh"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
command -v rclone > /dev/null || apt-get install -y rclone

val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d "\"'" | tr -d '\r'; }
ENDPOINT="$(val STORAGE_S3_ENDPOINT)"
REGION="$(val STORAGE_S3_REGION)"
KEY_ID="$(val STORAGE_S3_ACCESS_KEY_ID)"
SECRET="$(val STORAGE_S3_SECRET_ACCESS_KEY)"
for v in ENDPOINT REGION KEY_ID SECRET; do
  [ -n "${!v}" ] || { echo "STORAGE_S3 setting for $v is missing in .env — stopping (see deploy/STORAGE.md)."; exit 1; }
done

# Rewrite the off-server block: drop old (commented or not) lines, append the live ones.
tmp="$(mktemp)"
grep -vE '^[#[:space:]]*(BACKUP_RCLONE_REMOTE|RCLONE_CONFIG_SUPABASE_[A-Z_]+)=' "$CONF" \
  | grep -v '^# --- Off-server copy' | grep -v '^# Create the keys in Supabase' > "$tmp" || true
grep -q '^BACKUP_ENCRYPT_KEY_FILE=' "$tmp" || echo 'BACKUP_ENCRYPT_KEY_FILE=/root/.tikdum-backup-key' >> "$tmp"
{
  echo ""
  echo "# --- Off-server copy to Supabase Storage (written by enable-offsite-backup.sh) ---"
  echo "BACKUP_RCLONE_REMOTE=supabase:$BUCKET"
  echo "RCLONE_CONFIG_SUPABASE_TYPE=s3"
  echo "RCLONE_CONFIG_SUPABASE_PROVIDER=Other"
  echo "RCLONE_CONFIG_SUPABASE_ENDPOINT=$ENDPOINT"
  echo "RCLONE_CONFIG_SUPABASE_REGION=$REGION"
  echo "RCLONE_CONFIG_SUPABASE_ACCESS_KEY_ID=$KEY_ID"
  echo "RCLONE_CONFIG_SUPABASE_SECRET_ACCESS_KEY=$SECRET"
} >> "$tmp"
install -m 600 "$tmp" "$CONF"
rm -f "$tmp"
echo "== settings written to $CONF (keys taken from .env, not shown)"

set -a; . "$CONF"; set +a
[ -s "${BACKUP_ENCRYPT_KEY_FILE:-}" ] || { echo "Encryption key $BACKUP_ENCRYPT_KEY_FILE is missing — run: bash deploy/install-backup.sh"; exit 1; }

# The bucket must be private. Create it (private is the S3 default) only if it isn't there.
buckets="$(rclone lsd supabase: 2>/dev/null | awk '{print $NF}' || true)"
if grep -qx "$BUCKET" <<< "$buckets"; then
  echo "== bucket $BUCKET found"
else
  echo "== bucket $BUCKET not found — creating it (private)"
  rclone mkdir "supabase:$BUCKET"
fi

echo "== running a backup now (takes a minute)"
code=0
/usr/local/bin/tikdum-backup >> /var/log/tikdum-backup.log 2>&1 || code=$?
tail -6 /var/log/tikdum-backup.log
echo
if tail -6 /var/log/tikdum-backup.log | grep -q "copied off-server"; then
  echo "OFF-SERVER BACKUP IS ON. It now runs every night at 02:30 UTC (8:00 AM India)."
else
  echo "Off-server copy did NOT work (exit $code) — send me the lines above."
fi
echo
echo "IMPORTANT: save the encryption key in your password manager (without it the Supabase"
echo "copies can't be opened if this server is lost). Show it with:  cat /root/.tikdum-backup-key"
