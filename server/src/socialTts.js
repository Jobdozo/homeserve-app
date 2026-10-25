// Voice-over for Video Studio (videoStudio.js): one spoken line as a WAV file, from Google's
// Gemini text-to-speech (Interactions API, GEMINI_TTS_MODEL) with the server's Gemini key. Hindi
// and Hinglish read naturally. If it fails, the video goes out with subtitles and music only.
const API = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const key = () => String(process.env.GEMINI_API_KEY || "").trim();
const model = () => String(process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts").trim();
const fail = (status, message) => Object.assign(new Error(message), { status });

// A warm female and a calm male voice from Google's list.
const VOICES = { female: "Kore", male: "Charon" };

// Pure: the spoken audio in an Interactions answer (base64), or null. Exported for tests.
function audioFrom(answer) {
  for (const step of answer?.steps || []) {
    if (step.type !== "model_output") continue;
    for (const c of step.content || []) if (c.type === "audio" && c.data) return c.data;
  }
  return null;
}

// Pure: how the line should be read. Exported for tests.
function instruction(line, language) {
  const how = language === "english" ? "in warm, clear Indian English" : "in warm, natural Hinglish (Hindi and English mixed, as people in Jammu speak)";
  return `Read this ${how}, friendly and upbeat, like a short home-services advert. Say only the words: ${String(line || "").trim()}`;
}

// Returns a WAV Buffer (24 kHz mono).
async function speak(line, { language = "hinglish", voice = "female" } = {}) {
  if (!key()) throw fail(400, "No Gemini key on the server");
  const r = await fetch(`${API}/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      model: model(),
      input: instruction(line, language),
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: VOICES[voice] || VOICES.female }] },
      store: false,
    }),
    signal: AbortSignal.timeout(90000),
  });
  const answer = await r.json().catch(() => ({}));
  if (!r.ok) throw fail(502, `Gemini voice: ${answer.error?.message || `HTTP ${r.status}`}`.slice(0, 300));
  const data = audioFrom(answer);
  if (!data) throw fail(502, "Gemini didn't return any audio");
  return Buffer.from(data, "base64");
}

module.exports = { speak, audioFrom, instruction, VOICES };
