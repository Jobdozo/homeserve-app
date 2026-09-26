#!/usr/bin/env bash
# Daily backup of the Tikdum server data folder (JSON records + uploaded photos
# and KYC documents). Installed by install-backup.sh; run by cron.
#
#   SRC   folder to back up          (default /root/tikdum-data)
#   DEST  where backups are kept     (default /root/tikdum-backups)
#   KEEP_DAILY_DAYS / KEEP_WEEKLY_DAYS   retention (default 14 / 56)
#   BACKUP_RCLONE_REMOTE  optional off-server copy, e.g. "gdrive:tikdum-backups"
#                         (needs rclone configured; set in /etc/tikdum-backup.conf)
#
# Restore:  systemctl/docker compose stop the server, then
#   tar -xzf <backup>.tar.gz -C /root      (recreates /root/tikdum-data)
#   and start the server again. See deploy/BACKUPS.md.
set -euo pipefail
umask 077 # backups contain customers' addresses and providers' KYC documents

[ -f /etc/tikdum-backup.conf ] && . /etc/tikdum-backup.conf
SRC="${SRC:-/root/tikdum-data}"
DEST="${DEST:-/root/tikdum-backups}"
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-14}"
KEEP_WEEKLY_DAYS="${KEEP_WEEKLY_DAYS:-56}"

log() { echo "$(date '+%F %T') $*"; }
fail() { log "BACKUP FAILED: $*"; exit 1; }

[ -d "$SRC" ] || fail "source folder $SRC not found"
mkdir -p "$DEST/daily" "$DEST/weekly"

# Need room for the new archive: at least the source size free.
need_kb=$(du -sk "$SRC" | cut -f1)
free_kb=$(df -Pk "$DEST" | awk 'NR==2 {print $4}')
[ "$free_kb" -gt "$((need_kb * 2))" ] || fail "not enough free disk space (need ~$((need_kb * 2 / 1024)) MB, have $((free_kb / 1024)) MB)"

stamp=$(date +%Y%m%d-%H%M%S)
name="tikdum-data-$stamp.tar.gz"
tmp="$DEST/daily/.$name.partial"

# The server rewrites small JSON files whole, so a file changing mid-read is
# rare and harmless; tar reports it with exit code 1, which we accept.
set +e
tar -czf "$tmp" --warning=no-file-changed -C "$(dirname "$SRC")" "$(basename "$SRC")"
code=$?
set -e
[ "$code" -le 1 ] || { rm -f "$tmp"; fail "tar exited with code $code"; }

# Verify before keeping it: readable, and it holds the records.
listing=$(tar -tzf "$tmp") || { rm -f "$tmp"; fail "archive is unreadable"; }
# (not `tar | grep -q`: grep quitting early would SIGPIPE tar and trip pipefail)
grep -q '\.json$' <<< "$listing" || { rm -f "$tmp"; fail "archive has no data files"; }
mv "$tmp" "$DEST/daily/$name"

# One copy per week (Sundays) is kept much longer.
[ "$(date +%u)" = "7" ] && cp "$DEST/daily/$name" "$DEST/weekly/$name"

# Retention
find "$DEST/daily" -name 'tikdum-data-*.tar.gz' -mtime +"$KEEP_DAILY_DAYS" -delete
find "$DEST/weekly" -name 'tikdum-data-*.tar.gz' -mtime +"$KEEP_WEEKLY_DAYS" -delete
find "$DEST/daily" -name '.*.partial' -mmin +120 -delete

size=$(du -h "$DEST/daily/$name" | cut -f1)
log "backup ok: $name ($size); $(ls "$DEST/daily" | wc -l) daily, $(ls "$DEST/weekly" | wc -l) weekly kept"

# Optional copy off this server, so losing the VPS doesn't lose the backups.
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  command -v rclone > /dev/null || fail "BACKUP_RCLONE_REMOTE is set but rclone isn't installed"
  rclone copy "$DEST/daily/$name" "$BACKUP_RCLONE_REMOTE" || fail "off-server copy failed"
  rclone delete "$BACKUP_RCLONE_REMOTE" --min-age "${KEEP_WEEKLY_DAYS}d" > /dev/null 2>&1 || true
  log "copied off-server to $BACKUP_RCLONE_REMOTE"
fi
