# Backups

## What is backed up

`/root/tikdum-data` on the VPS (mounted into the server container as `/app/data`):
all the JSON records (banners, settings, complaints, staff, fee overrides, audit log…),
`uploads/` (service photos, KYC documents, job photos, complaint evidence).

**Not in this folder:**
- The main database (users, services, bookings, providers) is Firebase Data Connect
  (Cloud SQL in Google Cloud) — back it up there (Google Cloud Console → Cloud SQL →
  the instance → Backups → enable automated backups).
- `/root/tikdum-secrets` (Google service-account key) and the `.env` file are kept out
  of backups on purpose. Keep a copy in your password manager.

## Set up (once)

```bash
cd /tmp/homeserve-deploy && git pull && bash deploy/install-backup.sh
```

That installs `/usr/local/bin/tikdum-backup`, a nightly 02:30 cron job, log rotation,
and runs the first backup straight away.

- Kept: 14 daily backups, plus one per week (Sundays) for 8 weeks.
- Location: `/root/tikdum-backups/daily` and `/weekly` (root-only permissions —
  they contain customers' addresses and providers' KYC documents).
- Log: `/var/log/tikdum-backup.log`. A failed run writes `BACKUP FAILED: …`.

## Check it

```bash
tail -5 /var/log/tikdum-backup.log
ls -lh /root/tikdum-backups/daily | tail -3
```

## Copy off the server (recommended)

Backups on the same VPS don't help if the VPS is lost. Install rclone, connect a
cloud drive (`rclone config`), then create `/etc/tikdum-backup.conf`:

```bash
BACKUP_RCLONE_REMOTE="gdrive:tikdum-backups"
```

The next nightly run will copy each backup there too and prune old ones.
(Hostinger also keeps weekly whole-server backups, but restoring one replaces the
entire server disk — use it only as a last resort.)

## Restore

```bash
cd /tmp/homeserve-deploy
docker compose -p homeserve stop server
mv /root/tikdum-data /root/tikdum-data.broken          # keep the current folder just in case
tar -xzf /root/tikdum-backups/daily/tikdum-data-YYYYMMDD-HHMMSS.tar.gz -C /root
docker compose -p homeserve up -d server
```

To restore a single file (e.g. one photo), extract just that path:
`tar -xzf <backup> -C /tmp tikdum-data/uploads/<file>` and copy it back.
