# Backups

## What is backed up

Every night the VPS runs `tikdum-backup` (installed by `deploy/install-backup.sh`):

1. **Database export** — every table of the main database (customers, providers,
   services, bookings, messages, notifications…) is read from Firebase Data Connect
   and written as JSON to `/root/tikdum-data/db-export/`.
2. **Data-folder archive** — `/root/tikdum-data` (JSON records, `db-export/`,
   `uploads/` = service photos, KYC documents, job photos, complaint evidence) is
   packed into `/root/tikdum-backups/daily/tikdum-data-<date>.tar.gz`.
3. **Off-server copy** (optional, recommended) — that archive is AES-256 encrypted
   and uploaded to **Supabase Storage** (private bucket `tikdum-backups`, Tokyo).
   Supabase only ever holds encrypted files.

Kept: 14 daily + 8 weekly (Sundays) locally; 30 days in Supabase.

**Not backed up here:** the Google service-account key (`/root/tikdum-secrets`) and the
`.env` file — keep copies in your password manager. Google's own Cloud SQL automated
backups are currently **off** (project has no billing account); the JSON export above
is the safety net.

## Set up (once)

```bash
cd /tmp/homeserve-deploy && git pull && bash deploy/install-backup.sh
```

This installs the tools (`openssl`, `rclone`), creates the encryption key
`/root/.tikdum-backup-key` and the settings file `/etc/tikdum-backup.conf`, adds the
02:30 (UTC) cron job, and runs the first backup.

**Save the encryption key outside the server, now:**

```bash
cat /root/.tikdum-backup-key
```

Put it in your password manager. If the server is lost the key on it is lost too, and
without the key the Supabase backups cannot be opened.

## Turn on the Supabase copy

1. In Supabase → Storage, the private bucket `tikdum-backups` exists.
2. In Supabase → Project Settings → Storage → **S3 Connection**, create an **access key**.
   Copy the *Access key ID* and *Secret access key*.
3. On the VPS: `nano /etc/tikdum-backup.conf`, remove the `#` from the seven
   `BACKUP_RCLONE_REMOTE` / `RCLONE_CONFIG_SUPABASE_*` lines, paste the two keys, save.
4. Test: `tikdum-backup` — the last lines should say `copied off-server: …tar.gz.enc`.

Supabase free plan limits: 1 GB storage, 50 MB per file. The job refuses to upload a
file over 45 MB (`BACKUP_MAX_OFFSITE_MB`) and logs `OFF-SERVER COPY FAILED` — when the
photos/KYC uploads grow that big, move to a paid plan or store uploads separately.
Free Supabase projects also pause after a week with no activity; the nightly upload
counts as activity, but check the dashboard if uploads ever start failing.

## Check it

```bash
tail -8 /var/log/tikdum-backup.log
ls -lh /root/tikdum-backups/daily | tail -3
```

Lines to look for: `database export ok: customers=… bookings=…`, `backup ok`, and (once
Supabase is on) `copied off-server`. Anything with `FAILED` needs attention. The exit code
is 2 if only the database export failed (the folder backup still ran), 1 for other failures.

## Restore

**From a local backup**

```bash
cd /tmp/homeserve-deploy
docker compose -p homeserve stop server
mv /root/tikdum-data /root/tikdum-data.broken            # keep the current folder just in case
tar -xzf /root/tikdum-backups/daily/tikdum-data-YYYYMMDD-HHMMSS.tar.gz -C /root
docker compose -p homeserve up -d server
```

**From Supabase** — download the `.tar.gz.enc` file from the bucket (dashboard → Storage
→ tikdum-backups), copy it to the server, then decrypt and restore as above:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in tikdum-data-YYYYMMDD-HHMMSS.tar.gz.enc -out restore.tar.gz \
  -pass file:/root/.tikdum-backup-key        # or a file holding your saved passphrase
tar -xzf restore.tar.gz -C /root
```

**The database itself** — the JSON files in `tikdum-data/db-export/` hold every row
(relations appear as `{ "id": … }`). If the Data Connect database is ever lost, they can
be re-inserted into a fresh one (a restore script is not written yet — ask before you need it).

To recover a single file (one photo): `tar -xzf <backup> -C /tmp tikdum-data/uploads/<file>`.
