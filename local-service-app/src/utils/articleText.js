// A blog article's text as blocks: "## " headings, paragraphs, "- " lists and **bold**. The same
// rules as the server's parser (server/src/blog.js), which writes the copy search engines read.

export function parseArticle(body) {
  const blocks = [];
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    if (list) blocks.push({ type: "ul", items: list });
    para = [];
    list = null;
  };
  for (const raw of String(body || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^#{2,3}\s+(.+)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: "h2", text: h[1] });
      continue;
    }
    const li = /^[-*•]\s+(.+)$/.exec(line);
    if (li) {
      if (para.length) {
        blocks.push({ type: "p", text: para.join(" ") });
        para = [];
      }
      (list = list || []).push(li[1]);
      continue;
    }
    if (list) flush();
    para.push(line.replace(/^#\s+/, ""));
  }
  flush();
  return blocks;
}

// "Some **bold** words" -> ["Some ", { bold: "bold" }, " words"]
export function inlineParts(text) {
  return String(text || "")
    .split(/(\*\*.+?\*\*)/g)
    .filter(Boolean)
    .map((p) => (/^\*\*.+\*\*$/.test(p) ? { bold: p.slice(2, -2) } : p));
}
