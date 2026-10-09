// Draws Tikdum's flat illustrations (public/illustrations/*.svg): one per category that has no
// photo yet, and one per common service type. Run `node scripts/make-illustrations.mjs` after
// changing a glyph. Every picture shares the same brand-purple tile so they sit together.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "illustrations");
mkdirSync(OUT, { recursive: true });

const W = "#FFFFFF"; // main shape
const L = "#DDD6FE"; // lavender: secondary shape
const A = "#FBBF24"; // amber: the one accent
const D = "#4A2FD1"; // dark purple: cut-outs and details

const tile = (glyph) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CF2"/><stop offset="1" stop-color="#4A2FD1"/></linearGradient></defs>
<rect width="200" height="200" rx="36" fill="url(#g)"/>
<circle cx="168" cy="28" r="52" fill="#fff" opacity=".07"/><circle cx="26" cy="182" r="40" fill="#fff" opacity=".06"/>
${glyph}
</svg>
`;

const spark = (x, y, s = 9, c = A) => `<path d="M${x} ${y - s}L${x + s * 0.3} ${y - s * 0.3}L${x + s} ${y}L${x + s * 0.3} ${y + s * 0.3}L${x} ${y + s}L${x - s * 0.3} ${y + s * 0.3}L${x - s} ${y}L${x - s * 0.3} ${y - s * 0.3}Z" fill="${c}"/>`;
const drop = (x, y, s = 1, c = W) => `<path d="M${x} ${y - 16 * s}C${x + 12 * s} ${y - 2 * s} ${x + 12 * s} ${y + 10 * s} ${x} ${y + 12 * s}C${x - 12 * s} ${y + 10 * s} ${x - 12 * s} ${y - 2 * s} ${x} ${y - 16 * s}Z" fill="${c}"/>`;

const glyphs = {
  // ---- categories ----
  "cat-home-maintenance": `<path d="M100 44 160 96H40Z" fill="${W}"/><rect x="54" y="94" width="92" height="64" rx="4" fill="${L}"/><rect x="86" y="118" width="28" height="40" rx="4" fill="${D}"/>
    <g transform="rotate(-38 146 138)"><rect x="140" y="106" width="13" height="58" rx="6.5" fill="${A}"/><circle cx="146.5" cy="104" r="16" fill="${A}"/><rect x="141" y="84" width="11" height="20" fill="#5B3FE0"/></g>`,
  "cat-gas-chimney-services": `<rect x="91" y="34" width="18" height="30" rx="3" fill="${L}"/><path d="M56 62H144L126 94H74Z" fill="${W}"/><rect x="70" y="94" width="60" height="7" rx="3" fill="${L}"/>
    <path d="M100 172C70 154 76 128 100 108 124 128 130 154 100 172Z" fill="${A}"/><path d="M100 164C86 154 90 140 100 130 110 140 114 154 100 164Z" fill="${W}"/>`,
  "cat-water-tank-cleaning": `<rect x="62" y="64" width="76" height="92" rx="16" fill="${W}"/><rect x="62" y="64" width="76" height="22" rx="11" fill="${L}"/><rect x="92" y="48" width="16" height="18" rx="4" fill="${L}"/>
    <path d="M70 118Q84 108 100 118T130 118" stroke="${D}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".55"/><path d="M70 136Q84 126 100 136T130 136" stroke="${D}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".35"/>
    ${drop(158, 58, 0.8, A)}${drop(40, 92, 0.6, L)}`,
  "cat-masonry-services": `<rect x="40" y="62" width="48" height="24" rx="4" fill="${W}"/><rect x="92" y="62" width="68" height="24" rx="4" fill="${L}"/><rect x="40" y="90" width="26" height="24" rx="4" fill="${L}"/><rect x="70" y="90" width="48" height="24" rx="4" fill="${W}"/><rect x="122" y="90" width="38" height="24" rx="4" fill="${L}"/>
    <rect x="40" y="118" width="48" height="24" rx="4" fill="${W}"/><rect x="92" y="118" width="68" height="24" rx="4" fill="${L}"/><path d="M118 168 150 150 160 164 128 176Z" fill="${A}"/><rect x="104" y="170" width="28" height="9" rx="4.5" transform="rotate(-24 118 174)" fill="${W}"/>`,
  "cat-interior-services": `<rect x="48" y="86" width="104" height="38" rx="16" fill="${W}"/><rect x="38" y="108" width="124" height="38" rx="14" fill="${L}"/><rect x="38" y="104" width="20" height="46" rx="10" fill="${W}"/><rect x="142" y="104" width="20" height="46" rx="10" fill="${W}"/>
    <rect x="52" y="146" width="8" height="12" rx="3" fill="${W}"/><rect x="140" y="146" width="8" height="12" rx="3" fill="${W}"/><path d="M164 44 182 44 176 62 170 62Z" fill="${A}"/><rect x="172" y="62" width="2.5" height="26" fill="${A}"/>`,
  "cat-domestic-help": `<path d="M64 112H136L128 160Q127 166 121 166H79Q73 166 72 160Z" fill="${W}"/><path d="M72 112Q100 78 128 112" stroke="${L}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <rect x="144" y="40" width="7" height="86" rx="3.5" transform="rotate(14 147 83)" fill="${A}"/><path d="M142 120 166 126 160 146 138 140Z" fill="${L}"/><circle cx="52" cy="84" r="9" fill="${L}"/><circle cx="68" cy="66" r="6" fill="${W}" opacity=".8"/>`,
  "cat-ro-water-purifier-services": `<rect x="66" y="40" width="68" height="104" rx="14" fill="${W}"/><rect x="76" y="54" width="48" height="22" rx="7" fill="${D}" opacity=".85"/><circle cx="88" cy="65" r="4" fill="${A}"/><rect x="76" y="86" width="48" height="8" rx="4" fill="${L}"/>
    <rect x="92" y="144" width="16" height="12" fill="${L}"/>${drop(100, 176, 0.75, A)}${spark(152, 66, 7, L)}`,
  "cat-laundry-services": `<path d="M72 54 100 64 128 54 156 76 138 96 128 88V150Q128 156 122 156H78Q72 156 72 150V88L62 96 44 76Z" fill="${W}"/><path d="M84 54Q100 74 116 54" stroke="${L}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <circle cx="158" cy="132" r="13" fill="${L}"/><circle cx="170" cy="112" r="8" fill="${W}" opacity=".85"/><circle cx="144" cy="152" r="7" fill="${A}"/>`,
  "cat-security-services": `<path d="M100 38 154 58V104C154 134 130 156 100 168 70 156 46 134 46 104V58Z" fill="${W}"/><path d="M76 102 94 120 126 84" stroke="${D}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${spark(158, 40, 8, A)}`,
  "cat-gardening-services": `<path d="M66 128H134L124 168Q123 174 117 174H83Q77 174 76 168Z" fill="${A}"/><rect x="62" y="118" width="76" height="14" rx="7" fill="${W}"/><rect x="97" y="70" width="6" height="52" rx="3" fill="${L}"/>
    <path d="M100 88C74 90 62 70 66 50 90 52 102 68 100 88Z" fill="${W}"/><path d="M100 104C126 104 140 84 136 62 112 64 98 82 100 104Z" fill="${L}"/>`,

  // ---- service types ----
  "type-waxing": `<rect x="62" y="88" width="76" height="62" rx="12" fill="${W}"/><rect x="56" y="72" width="88" height="22" rx="10" fill="${L}"/><rect x="72" y="108" width="56" height="12" rx="6" fill="${A}" opacity=".9"/>
    <rect x="144" y="40" width="10" height="64" rx="5" transform="rotate(22 149 72)" fill="${W}"/><rect x="138" y="30" width="22" height="16" rx="4" transform="rotate(22 149 38)" fill="${L}"/>${spark(48, 52, 8)}`,
  "type-bleach-detan": `<circle cx="100" cy="86" r="26" fill="${A}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="97" y="40" width="6" height="14" rx="3" transform="rotate(${a} 100 86)" fill="${A}"/>`).join("")}
    <rect x="68" y="122" width="64" height="38" rx="10" fill="${W}"/><rect x="76" y="114" width="48" height="12" rx="6" fill="${L}"/>${spark(146, 144, 7, L)}`,
  "type-facial": `<ellipse cx="100" cy="98" rx="38" ry="48" fill="${W}"/><path d="M82 92Q88 98 94 92M106 92Q112 98 118 92" stroke="${D}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M90 120Q100 128 110 120" stroke="${D}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M62 62C70 40 96 38 112 44 108 60 80 70 62 62Z" fill="${L}"/><path d="M142 130C156 124 166 132 168 144 156 150 144 144 142 130Z" fill="${A}"/>${spark(48, 118, 8)}${spark(154, 62, 6, L)}`,
  "type-cleanup": `${drop(100, 92, 2.2, W)}${drop(52, 70, 0.9, L)}${drop(150, 134, 1.1, L)}${spark(150, 62, 11)}${spark(56, 138, 8, L)}<path d="M88 100Q92 112 104 112" stroke="${D}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".5"/>`,
  "type-manicure-pedicure": `<rect x="78" y="96" width="44" height="62" rx="12" fill="${W}"/><rect x="90" y="72" width="20" height="28" rx="4" fill="${L}"/><rect x="88" y="42" width="24" height="34" rx="8" fill="${A}"/><rect x="86" y="112" width="28" height="22" rx="6" fill="${D}" opacity=".35"/>${spark(146, 78, 8, L)}${spark(52, 130, 7)}`,
  "type-massage": `<ellipse cx="100" cy="150" rx="52" ry="17" fill="${W}"/><ellipse cx="100" cy="124" rx="38" ry="14" fill="${L}"/><ellipse cx="100" cy="102" rx="26" ry="11" fill="${W}"/>
    <path d="M118 78C118 58 140 48 156 52 152 72 136 86 118 78Z" fill="${A}"/>${spark(50, 70, 8, L)}`,
  "type-body-polishing": `${spark(100, 96, 40, W)}${spark(150, 54, 13, A)}${spark(52, 140, 11, L)}${spark(154, 146, 8, L)}${drop(52, 62, 0.7, L)}`,
  "type-threading": `<path d="M56 148C52 80 148 80 144 148" stroke="${W}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M56 148 144 148M70 118 130 148M130 118 70 148" stroke="${A}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="56" cy="148" r="9" fill="${L}"/><circle cx="144" cy="148" r="9" fill="${L}"/>${spark(100, 62, 9, L)}`,
  "type-haircut": `<circle cx="70" cy="132" r="15" fill="none" stroke="${W}" stroke-width="8"/><circle cx="130" cy="132" r="15" fill="none" stroke="${W}" stroke-width="8"/><path d="M80 120 140 52M120 120 60 52" stroke="${L}" stroke-width="9" stroke-linecap="round"/><circle cx="100" cy="88" r="6" fill="${A}"/>${spark(160, 150, 7)}`,
  "type-ac-service": `${[0, 60, 120].map((a) => `<rect x="96" y="40" width="8" height="120" rx="4" transform="rotate(${a} 100 100)" fill="${W}"/>`).join("")}<circle cx="100" cy="100" r="13" fill="${L}"/>
    ${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="100" cy="46" r="6" transform="rotate(${a} 100 100)" fill="${A}"/>`).join("")}`,
  "type-ac-repair-gas": `<rect x="78" y="58" width="44" height="100" rx="16" fill="${W}"/><rect x="90" y="40" width="20" height="22" rx="5" fill="${A}"/><circle cx="100" cy="98" r="14" fill="${D}" opacity=".85"/><path d="M100 98 108 90" stroke="${A}" stroke-width="4" stroke-linecap="round"/>
    <rect x="86" y="128" width="28" height="9" rx="4.5" fill="${L}"/><path d="M124 46 148 38 154 54" stroke="${L}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  "type-ac-installation": `<rect x="40" y="62" width="120" height="48" rx="12" fill="${W}"/><rect x="52" y="92" width="96" height="6" rx="3" fill="${L}"/><circle cx="140" cy="80" r="6" fill="${D}" opacity=".6"/>
    <path d="M52 124 148 124" stroke="${A}" stroke-width="7" stroke-linecap="round"/><path d="M62 124V150M138 124V150" stroke="${A}" stroke-width="7" stroke-linecap="round"/><path d="M92 140 100 150 108 140" stroke="${L}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
};

for (const [name, glyph] of Object.entries(glyphs)) writeFileSync(join(OUT, `${name}.svg`), tile(glyph));
console.log(`wrote ${Object.keys(glyphs).length} illustrations to ${OUT}`);
