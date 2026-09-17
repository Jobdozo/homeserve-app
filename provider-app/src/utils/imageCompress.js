// Phone camera captures (especially high-megapixel sensors) routinely produce
// 10-20MB JPEGs — well past what anyone needs for a job/KYC photo, and past
// the server's upload cap. Downscale and re-encode client-side so uploads
// stay small and fast regardless of the source camera's resolution.
export async function compressImage(file, { maxDimension = 1600, quality = 0.8 } = {}) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unsupported format (e.g. some HEIC) — let the server decide

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob || blob.size >= file.size) return file; // compression didn't help — keep the original

  const name = file.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
