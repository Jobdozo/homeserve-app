#!/usr/bin/env bash
# Lets api.tikdum.com take uploads up to 20 MB (nginx's default is 1 MB). Pictures are shrunk in the
# browser first, so they fit; a music track for Video Studio (2–15 MB) was refused with 413, which
# the admin shows as "Failed to fetch" (25 Oct 2026).
#
#   cd /root/homeserve-deploy && git pull && bash deploy/nginx-upload-size.sh
#
# Backs up the nginx file first, checks the new setting with nginx -t, and puts the backup back if
# the check fails. Safe to run again.
set -euo pipefail
SIZE=20m
file="$(grep -rl 'server_name api\.tikdum\.com' /etc/nginx/sites-enabled/ 2>/dev/null | head -1 || true)"
[ -n "$file" ] || { echo "No nginx site for api.tikdum.com in /etc/nginx/sites-enabled. Nothing was changed."; exit 1; }
file="$(readlink -f "$file")"
backup="/root/nginx-$(basename "$file")-$(date +%Y%m%d-%H%M%S).bak"
cp -p "$file" "$backup"
echo "== nginx file: $file (backup: $backup)"

# After every "server_name api.tikdum.com;" line (the http block and certbot's https block), unless
# the next line already sets it.
awk -v size="$SIZE" '
  { print }
  /server_name[ \t]+api\.tikdum\.com;/ {
    indent = $0; sub(/[^ \t].*/, "", indent)
    if ((getline next_line) > 0) {
      if (next_line !~ /client_max_body_size/) print indent "client_max_body_size " size ";"
      print next_line
    }
  }' "$backup" > "$file"

if nginx -t 2>/dev/null; then
  systemctl reload nginx
  echo "== uploads up to $SIZE allowed on api.tikdum.com ($(grep -c "client_max_body_size $SIZE" "$file") place(s) in the file)"
else
  cp -p "$backup" "$file"
  echo "nginx didn't accept the change, so the old file was put back. Nothing else changed. Send me these lines:"
  nginx -t || true
  exit 1
fi
