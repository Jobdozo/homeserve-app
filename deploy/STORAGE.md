# Photos on cloud storage (scaling step 3)

Uploads are still saved on the VPS first (`/root/tikdum-data/uploads`), so nothing
changes for the apps. Once the settings below are in place, the server copies every
file to cloud storage within a minute or two of upload:

- **Public bucket** — service photos, profile photos, category and type pictures.
  `/uploads/<file>` links then redirect to the bucket's CDN, so photos load from the
  CDN, not from the VPS.
- **Private bucket** — KYC documents, job before/after photos, complaint evidence.
  Never public; the server still serves them itself, and fetches them back from the
  bucket if the VPS copy is ever lost. (New private uploads are named `p-…`.)

Off until all seven settings are present. Any S3-compatible service works (Supabase
Storage, Cloudflare R2, Backblaze B2, AWS S3); the steps below use Supabase, which
already holds the off-server backups.

## Set up with Supabase

1. **Supabase → Storage → New bucket**
   - `tikdum-photos` — **Public bucket: ON**, file size limit 15 MB.
   - `tikdum-private` — **Public bucket: OFF**, file size limit 15 MB.
2. **Project Settings → Storage → S3 Connection**: create an access key (or reuse the
   one made for backups). Copy the *Access key ID* and *Secret access key*.
3. On the VPS, add to `/root/homeserve-deploy/.env` (the keys go only here, never in Git):

   ```
   STORAGE_S3_ENDPOINT=https://kayolbcjmmzwoxbdpjvz.storage.supabase.co/storage/v1/s3
   STORAGE_S3_REGION=ap-northeast-1
   STORAGE_S3_ACCESS_KEY_ID=PASTE_ACCESS_KEY_ID
   STORAGE_S3_SECRET_ACCESS_KEY=PASTE_SECRET
   STORAGE_PUBLIC_BUCKET=tikdum-photos
   STORAGE_PRIVATE_BUCKET=tikdum-private
   STORAGE_PUBLIC_BASE_URL=https://kayolbcjmmzwoxbdpjvz.supabase.co/storage/v1/object/public/tikdum-photos
   ```

4. Restart the server so it reads them:

   ```bash
   cd /root/homeserve-deploy && git pull && bash deploy/build-images.sh server
   ```

## Check it

`https://api.tikdum.com/api/health` shows `uploads`: `enabled: true`, `copied` going up,
`pending` going down to 0 (up to 200 files a minute), and `lastError` empty. In Supabase,
the two buckets fill with files. Open any service photo in the app: its address now
redirects to `…supabase.co/storage/v1/object/public/tikdum-photos/…`.

## Plan limits

Supabase's free plan has a monthly limit on storage and on data served. When photos
start to use a lot of it, either upgrade the Supabase plan or move the public bucket to
Cloudflare R2 (no charge for data served): create the buckets there, copy the files
across, and change the seven settings — nothing else changes.

## Turning it off

Remove the seven lines and restart. The server serves everything from the VPS again
(the local copies are never deleted).
