#!/bin/bash
# Run this on the VPS (as root) via SSH: ssh root@187.127.157.192
# Adds Nginx server blocks that proxy tikdum.com + subdomains to the
# HomeServe Docker containers already running on 127.0.0.1:5175/5174/5177/4000.
# Does NOT touch any existing site config on this box.
set -euo pipefail

CONF=/etc/nginx/sites-available/tikdum.com
LINK=/etc/nginx/sites-enabled/tikdum.com

cat > "$CONF" <<'NGINX'
server {
    listen 80;
    server_name tikdum.com www.tikdum.com;
    location / {
        proxy_pass http://127.0.0.1:5175;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name provider.tikdum.com;
    location / {
        proxy_pass http://127.0.0.1:5174;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name admin.tikdum.com;
    location / {
        proxy_pass http://127.0.0.1:5177;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.tikdum.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -sf "$CONF" "$LINK"
nginx -t
systemctl reload nginx

echo "Nginx blocks installed. Now requesting certs (only after DNS for these hosts points at this server)..."
apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || true
certbot --nginx -d tikdum.com -d www.tikdum.com -d provider.tikdum.com -d admin.tikdum.com -d api.tikdum.com --non-interactive --agree-tos -m "$1"

echo "Done. Visit https://tikdum.com"
