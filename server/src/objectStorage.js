// Cloud storage for uploads (scaling step 3): any S3-compatible service —
// Supabase Storage, Cloudflare R2, Backblaze B2, AWS S3 — reached with plain
// signed HTTP requests (AWS Signature V4), no SDK. Off unless every setting below
// is present, so a missing or half-filled config can never break uploads.
//
//   STORAGE_S3_ENDPOINT        e.g. https://<project>.storage.supabase.co/storage/v1/s3
//   STORAGE_S3_REGION          e.g. ap-northeast-1 (R2: auto)
//   STORAGE_S3_ACCESS_KEY_ID / STORAGE_S3_SECRET_ACCESS_KEY
//   STORAGE_PUBLIC_BUCKET      photos anyone may see (service, profile, banners)
//   STORAGE_PRIVATE_BUCKET     KYC documents, job photos, complaint evidence
//   STORAGE_PUBLIC_BASE_URL    where the public bucket is served from (CDN), e.g.
//                              https://<project>.supabase.co/storage/v1/object/public/<public bucket>
const crypto = require("crypto");

function config(env = process.env) {
  const c = {
    endpoint: String(env.STORAGE_S3_ENDPOINT || "").replace(/\/+$/, ""),
    region: env.STORAGE_S3_REGION || "",
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID || "",
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY || "",
    publicBucket: env.STORAGE_PUBLIC_BUCKET || "",
    privateBucket: env.STORAGE_PRIVATE_BUCKET || "",
    publicBaseUrl: String(env.STORAGE_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  };
  c.enabled = Boolean(c.endpoint && c.region && c.accessKeyId && c.secretAccessKey && c.publicBucket && c.privateBucket && c.publicBaseUrl);
  return c;
}

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
// RFC 3986 encoding as S3 expects it, keeping "/" in paths.
const encodePath = (p) => p.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

// The Authorization header for one request (AWS Signature Version 4).
function signRequest({ method, url, headers = {}, payloadHash, region, accessKeyId, secretAccessKey, service = "s3", now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash };
  const names = Object.keys(all).sort();
  const canonicalQuery = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [method, encodePath(decodeURIComponent(u.pathname)), canonicalQuery, names.map((n) => `${n}:${all[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), "aws4_request");
  const signature = crypto.createHmac("sha256", key).update(toSign).digest("hex");
  return {
    headers: { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` },
    signature,
  };
}

function objectUrl(c, bucket, key) {
  return `${c.endpoint}/${encodePath(bucket)}/${encodePath(key)}`;
}

async function send(c, method, bucket, key, { body, contentType, cacheControl } = {}) {
  const url = objectUrl(c, bucket, key);
  const payload = body || Buffer.alloc(0);
  const { headers } = signRequest({
    method,
    url,
    headers: { ...(contentType ? { "content-type": contentType } : {}), ...(cacheControl ? { "cache-control": cacheControl } : {}) },
    payloadHash: sha256(payload),
    region: c.region,
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
  });
  delete headers.host; // fetch sets it
  const res = await fetch(url, { method, headers, body: method === "PUT" ? payload : undefined, signal: AbortSignal.timeout(60000) });
  return res;
}

// "403 SignatureDoesNotMatch: …" from an S3 error body (XML), or its first words.
async function errorText(res) {
  const body = await res.text().catch(() => "");
  const code = (body.match(/<Code>([^<]*)<\/Code>/) || [])[1];
  const message = (body.match(/<Message>([^<]*)<\/Message>/) || [])[1];
  return `${res.status}${code ? ` ${code}` : ""}: ${message || body.replace(/<[^>]+>/g, " ").trim().slice(0, 160)}`;
}

// cacheControl: how long phones and the CDN may keep the file (e.g. a photo whose name never changes).
async function putObject(c, bucket, key, body, contentType, cacheControl) {
  const res = await send(c, "PUT", bucket, key, { body, contentType, cacheControl });
  if (!res.ok) throw new Error(`upload failed (${await errorText(res)})`);
}

async function getObject(c, bucket, key) {
  const res = await send(c, "GET", bucket, key);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`download failed (${await errorText(res)})`);
  return Buffer.from(await res.arrayBuffer());
}

async function deleteObject(c, bucket, key) {
  const res = await send(c, "DELETE", bucket, key);
  if (!res.ok && res.status !== 404) throw new Error(`delete failed (${await errorText(res)})`);
}

const publicUrl = (c, key) => `${c.publicBaseUrl}/${encodePath(key)}`;

module.exports = { config, signRequest, putObject, getObject, deleteObject, publicUrl, encodePath };
