// The pictures social.js draws itself for carousels and Stories, in Tikdum's look: a deep
// colour from the post's category, the brand fonts (assets/fonts, SIL Open Font License) and
// the Tikdum logo. Text is set by the image library (sharp/Pango) from the bundled font files,
// so it doesn't depend on fonts installed on the server. Latin script only — the server has no
// Devanagari font, so slides are written in English/Hinglish.
//
//   coverSlide(photo, title, colour)   1080×1080: the post's photo with the title on a band
//   textSlide({ title, text, n, total, colour })   1080×1080 card for one point
//   ctaSlide(colour)                   1080×1080 last card: book on tikdum.com / the app
//   storyImage(photo, line, colour)    1080×1920 Story: photo on top, one line, the call to action
const path = require("path");
const fs = require("fs");
const imageStyle = require("./imageStyle");

const FONTS = path.join(__dirname, "assets", "fonts");
const DISPLAY = { family: "Bricolage Grotesque", file: path.join(FONTS, "BricolageGrotesque.ttf") };
const BODY = { family: "Figtree", file: path.join(FONTS, "Figtree.ttf") };
const NIGHT = "#2A1A7A"; // Tikdum violet (night), when the post has no category colour
const SIZE = 1080;

const sharp = () => require("sharp");
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A darker shade of the category colour, so white text on it always reads.
function deep(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return NIGHT;
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * 0.42));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

async function text(str, { font, size, weight = 400, colour = "#ffffff", width, align = "left" }) {
  const markup = `<span foreground="${colour}" weight="${weight}">${esc(str)}</span>`;
  return sharp()({ text: { text: markup, font: `${font.family} ${size}`, fontfile: font.file, width, align, rgba: true, wrap: "word" } }).png().toBuffer();
}

async function logo(width) {
  const file = imageStyle.logoFile();
  if (!fs.existsSync(file)) return null;
  return sharp()(file).resize({ width }).png().toBuffer();
}

const ground = (w, h, fill, accent) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/>` +
      `<circle cx="${w - 90}" cy="110" r="250" fill="${accent}" opacity="0.28"/><circle cx="60" cy="${h - 40}" r="140" fill="${accent}" opacity="0.16"/></svg>`
  );

async function layers(list) {
  const out = [];
  for (const l of list) if (l.input) out.push(l);
  return out;
}

async function textSlide({ title, text: body, n, total, colour }) {
  const fill = deep(colour?.hex);
  const accent = colour?.hex || "#7B63F5";
  const head = await text(title, { font: DISPLAY, size: 66, weight: 800, width: 880 });
  const headH = (await sharp()(head).metadata()).height;
  const para = body ? await text(body, { font: BODY, size: 36, colour: "#ffffffd9", width: 880 }) : null;
  const paraH = para ? (await sharp()(para).metadata()).height : 0;
  const count = n && total ? await text(`${n}/${total}`, { font: BODY, size: 26, weight: 700, colour: "#ffffffb3", width: 200 }) : null;
  const mark = await logo(250);
  const top = Math.max(170, Math.round((SIZE - headH - paraH - 40) / 2) - 40);
  return sharp()(ground(SIZE, SIZE, fill, accent))
    .composite(await layers([
      { input: count, left: 100, top: 90 },
      { input: head, left: 100, top },
      { input: para, left: 100, top: top + headH + 40 },
      { input: mark, left: 100, top: SIZE - 150 },
    ]))
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function ctaSlide(colour) {
  return textSlide({ title: "Book a verified professional", text: "On tikdum.com or the Tikdum app — at a time that suits you.", colour });
}

// The post's photo, cropped square, with the title on a colour band across the bottom.
async function coverSlide(photo, title, colour) {
  const base = await sharp()(photo).rotate().resize(SIZE, SIZE, { fit: "cover", position: "attention" }).toBuffer();
  const head = await text(title, { font: DISPLAY, size: 58, weight: 800, width: 900 });
  const headH = (await sharp()(head).metadata()).height;
  const bandH = headH + 90;
  const band = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${bandH}"><rect width="${SIZE}" height="${bandH}" fill="${deep(colour?.hex)}" opacity="0.92"/></svg>`);
  const swipe = await text("Swipe →", { font: BODY, size: 26, weight: 700, colour: "#ffffffcc", width: 200, align: "right" });
  return sharp()(base)
    .composite(await layers([
      { input: band, left: 0, top: SIZE - bandH },
      { input: head, left: 90, top: SIZE - bandH + 45 },
      { input: swipe, left: SIZE - 290, top: 50 },
    ]))
    .jpeg({ quality: 90 })
    .toBuffer();
}

// A Story (9:16): the photo square on top, one line below it and the call to action.
async function storyImage(photo, line, colour) {
  const W = SIZE;
  const H = 1920;
  const fill = deep(colour?.hex);
  const pic = await sharp()(photo).rotate().resize(W, W, { fit: "cover", position: "attention" }).toBuffer();
  const head = await text(line, { font: DISPLAY, size: 64, weight: 800, width: 900 });
  const headH = (await sharp()(head).metadata()).height;
  const cta = await text("Book on tikdum.com or the Tikdum app", { font: BODY, size: 34, weight: 700, colour: "#ffffffe6", width: 900 });
  const mark = await logo(300);
  return sharp()(ground(W, H, fill, colour?.hex || "#7B63F5"))
    .composite(await layers([
      { input: pic, left: 0, top: 180 },
      { input: head, left: 90, top: 180 + W + 70 },
      { input: cta, left: 90, top: 180 + W + 70 + headH + 40 },
      { input: mark, left: 90, top: H - 230 },
    ]))
    .jpeg({ quality: 88 })
    .toBuffer();
}

module.exports = { textSlide, ctaSlide, coverSlide, storyImage, deep };
