#!/usr/bin/env bash
# Nightly backup of the Tikdum server. Installed by install-backup.sh; run by cron.
#
#   1. Exports every database table (Data Connect / Postgres) to JSON inside the
#      data folder (db-export/), so the data exists outside Google too.
#   2. Archives the data folder (JSON records, db-export/, uploaded photos and
#      KYC documents) into /root/tikdum-backups.
#   3. Optionally encrypts the archive and copies it off this server (Supabase
#      Storage, via rclone) — see /etc/tikdum-backup.conf.
#
# Settings (all optional; put them in /etc/tikdum-backup.conf):
#   SRC, DEST                      folders (default /root/tikdum-data, /root/tikdum-backups)
#   KEEP_DAILY_DAYS / KEEP_WEEKLY_DAYS   local retention (default 14 / 56)
#   EXPORT_CMD                     command that writes db-export/ (default: docker exec into
#                                  the running homeserve "server" container)
#   BACKUP_ENCRYPT_KEY_FILE        file holding the passphrase; the off-server copy is
#                                  AES-256 encrypted with it (strongly recommended)
#   BACKUP_RCLONE_REMOTE           e.g. "supabase:tikdum-backups" (rclone remote:bucket)
#   KEEP_OFFSITE_DAYS              off-server retention (default 30)
#   BACKUP_MAX_OFFSITE_MB          refuse to upload bigger files (default 45; Supabase free
#                                  plan allows 50 MB per file)
#
# Restore: see deploy/BACKUPS.md.
set -euo pipefail
umask 077 # backups contain customers' addresses and providers' KYC documents

if [ -f /etc/tikdum-backup.conf ]; then set -a; . /etc/tikdum-backup.conf; set +a; fi
SRC="${SRC:-/root/tikdum-data}"
DEST="${DEST:-/root/tikdum-backups}"
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-14}"
KEEP_WEEKLY_DAYS="${KEEP_WEEKLY_DAYS:-56}"
KEEP_OFFSITE_DAYS="${KEEP_OFFSITE_DAYS:-30}"
BACKUP_MAX_OFFSITE_MB="${BACKUP_MAX_OFFSITE_MB:-45}"

log() { echo "$(date '+%F %T') $*"; }

# A one-line status for the API's /api/health (and so the uptime check) to read:
# written however the run ends. No file names or keys, only how each step went.
STATUS_FILE="${STATUS_FILE:-$SRC/backup-status.json}"
st_db="not run"; st_archive="failed"; st_offsite="off"; st_note=""
write_status() {
  local code=$?
  local note="${st_note//\"/}"
  { printf '{"at":"%s","exitCode":%d,"database":"%s","archive":"%s","offsite":"%s","note":"%s"}\n' \
      "$(date -u +%FT%TZ)" "$code" "$st_db" "$st_archive" "$st_offsite" "$note" > "$STATUS_FILE.tmp" \
    && chmod 644 "$STATUS_FILE.tmp" && mv "$STATUS_FILE.tmp" "$STATUS_FILE"; } 2> /dev/null || true
}
trap write_status EXIT

fail() { st_note="$*"; log "BACKUP FAILED: $*"; exit 1; }
offsite_fail() { st_offsite="failed"; st_note="$*"; log "OFF-SERVER COPY FAILED: $*"; exit 1; }

[ -d "$SRC" ] || fail "source folder $SRC not found"
mkdir -p "$DEST/daily" "$DEST/weekly"

# ---- 1. database export (a failure is reported, but the folder backup still runs) ----
problems=0
run_export() {
  if [ -n "${EXPORT_CMD:-}" ]; then bash -c "$EXPORT_CMD"; return; fi
  command -v docker > /dev/null || { echo "docker not found"; return 1; }
  local cid
  cid=$(docker ps -q --filter label=com.docker.compose.project=homeserve --filter label=com.docker.compose.service=server | head -1)
  [ -n "$cid" ] || { echo "server container is not running"; return 1; }
  docker exec "$cid" node src/exportDatabase.js
}
if out=$(run_export 2>&1); then
  log "$out"
  st_db="ok"
else
  log "DATABASE EXPORT FAILED: $out"
  st_db="failed"
  problems=1
fi

# ---- 2. archive the data folder ----
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
st_archive="ok"

# One copy per week (Sundays) is kept much longer.
[ "$(date +%u)" = "7" ] && cp "$DEST/daily/$name" "$DEST/weekly/$name"

find "$DEST/daily" -name 'tikdum-data-*.tar.gz*' -mtime +"$KEEP_DAILY_DAYS" -delete
find "$DEST/weekly" -name 'tikdum-data-*.tar.gz*' -mtime +"$KEEP_WEEKLY_DAYS" -delete
find "$DEST/daily" -name '.*.partial' -mmin +120 -delete

size=$(du -h "$DEST/daily/$name" | cut -f1)
log "backup ok: $name ($size); $(ls "$DEST/daily" | wc -l) daily, $(ls "$DEST/weekly" | wc -l) weekly kept"

# ---- 3. copy off this server, encrypted ----
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  command -v rclone > /dev/null || offsite_fail "rclone isn't installed"
  upload="$DEST/daily/$name"
  if [ -n "${BACKUP_ENCRYPT_KEY_FILE:-}" ]; then
    [ -s "$BACKUP_ENCRYPT_KEY_FILE" ] || offsite_fail "encryption key file $BACKUP_ENCRYPT_KEY_FILE is missing or empty"
    upload="$DEST/daily/.$name.enc.partial"
    openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$DEST/daily/$name" -out "$upload" -pass "file:$BACKUP_ENCRYPT_KEY_FILE" \
      || { rm -f "$upload"; offsite_fail "encryption failed"; }
    remote_name="$name.enc"
  else
    log "WARNING: no BACKUP_ENCRYPT_KEY_FILE set — the off-server copy is NOT encrypted"
    remote_name="$name"
  fi
  up_mb=$(( ($(stat -c %s "$upload") + 1048575) / 1048576 ))
  if [ "$up_mb" -gt "$BACKUP_MAX_OFFSITE_MB" ]; then
    rm -f "$upload"
    offsite_fail "backup is ${up_mb} MB, over the ${BACKUP_MAX_OFFSITE_MB} MB limit (upgrade the plan or raise BACKUP_MAX_OFFSITE_MB)"
  fi
  if rclone copyto "$upload" "$BACKUP_RCLONE_REMOTE/$remote_name" --s3-no-check-bucket; then
    log "copied off-server: $remote_name (${up_mb} MB) -> $BACKUP_RCLONE_REMOTE"
    st_offsite="copied"
  else
    rm -f "$upload"
    offsite_fail "upload error"
  fi
  [ "$upload" != "$DEST/daily/$name" ] && rm -f "$upload"
  rclone delete "$BACKUP_RCLONE_REMOTE" --min-age "${KEEP_OFFSITE_DAYS}d" --s3-no-check-bucket > /dev/null 2>&1 || true
fi

[ "$problems" = "0" ] || exit 2
