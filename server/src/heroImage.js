// Generates the per-service "brand ambassador" photo shown on service cards:
// the reference photo in server/assets/brand-ambassador.png, composited by
// Gemini's image model into a new photo of that same person performing the
// specific service's activity. Called once per service (on creation, or via
// the backfill script) — the result is cached to disk and stored on the
// service row (store.setServiceHeroImage), never regenerated on every view.
const fs = require("fs");
const path = require("path");

const GEMINI_MODEL = "gemini-2.5-flash-image";
const REFERENCE_IMAGE_PATH = path.join(__dirname, "..", "assets", "brand-ambassador.png");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads", "services");

function buildPrompt(serviceName, categoryName) {
  return `Using the exact person shown in the attached reference photo (same face, same beard and hairstyle, same black polo shirt with the white "Tikdum" logo on the chest), generate a new professional studio photograph of this same person actively performing this specific job: "${serviceName}" (service category: ${categoryName}).

Style requirements:
- Plain light gray or white seamless studio background, evenly and softly lit, no harsh shadows
- Waist-up or three-quarter framing, person facing the camera or naturally posed mid-task
- Holding or using tools/equipment that are realistic and specific to this exact job
- Confident, friendly, professional expression
- Sharp focus, commercial product-photography quality — the same visual style as Urban Company's service marketing photos
- Keep the same facial features, beard, hairstyle and build as the reference photo exactly
- Roughly square framing, suitable for a mobile app service card`;
}

async function generateImageBuffer(serviceName, categoryName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const referenceBase64 = fs.readFileSync(REFERENCE_IMAGE_PATH).toString("base64");
  const prompt = buildPrompt(serviceName, categoryName);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, { inlineData: { mimeType: "image/png", data: referenceBase64 } }],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini image generation failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart) throw new Error("Gemini response contained no image data");

  return Buffer.from(imagePart.inlineData.data, "base64");
}

function saveServiceImage(serviceId, buffer) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, `${serviceId}.png`), buffer);
  return `/uploads/services/${serviceId}.png`;
}

module.exports = { generateImageBuffer, saveServiceImage, UPLOADS_DIR };
