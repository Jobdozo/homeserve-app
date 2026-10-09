// Firebase Data Connect returns at most 100 rows from a list query unless the
// query asks for more. Once a table passed 100 rows the app silently saw only
// the first 100 (a salon import took the services table past it and hid other
// providers' services). This rewrites a read query so every root list field
// asks for up to MAX_ROWS, unless it already has its own limit.
//
// Only the root fields of the operation are touched, and only ones that return
// a list: a field looked up by id/key (service(id: $id), *_by_key) is a single
// row and must not get a limit.
const MAX_ROWS = 5000;

function matching(src, i, open, close) {
  // src[i] === open; returns the index of the matching close, skipping quoted strings
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '"') {
      j++;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
    } else if (c === open) depth++;
    else if (c === close && --depth === 0) return j;
  }
  return -1;
}

function addListLimits(gql, max = MAX_ROWS) {
  const start = gql.indexOf("{");
  if (start === -1) return gql;
  const end = matching(gql, start, "{", "}");
  if (end === -1) return gql;

  let out = gql.slice(0, start + 1);
  let i = start + 1;
  while (i < end) {
    const rest = gql.slice(i, end);
    const m = rest.match(/^[\s,]*(?:[A-Za-z_][A-Za-z0-9_]*\s*:\s*)?([A-Za-z_][A-Za-z0-9_]*)/); // optional alias, then the field name
    if (!m) {
      out += gql.slice(i, end);
      break;
    }
    const fieldEnd = i + m[0].length;
    const name = m[1];
    let j = fieldEnd;
    while (/\s/.test(gql[j])) j++;
    let args = "";
    let argsEnd = fieldEnd;
    if (gql[j] === "(") {
      const close = matching(gql, j, "(", ")");
      if (close === -1) return gql;
      args = gql.slice(j + 1, close);
      argsEnd = close + 1;
    }
    let after = argsEnd;
    while (/\s/.test(gql[after])) after++;
    let bodyEnd = after;
    if (gql[after] === "{") {
      const close = matching(gql, after, "{", "}");
      if (close === -1) return gql;
      bodyEnd = close + 1;
    }
    const single = /_by_key$/.test(name) || /(^|[\s,{(])(id|key)\s*:/.test(args);
    const hasLimit = /\blimit\s*:/.test(args);
    if (single || hasLimit) {
      out += gql.slice(i, bodyEnd);
    } else if (args.trim()) {
      out += gql.slice(i, j + 1) + args + `, limit: ${max})` + gql.slice(argsEnd, bodyEnd);
    } else {
      out += gql.slice(i, fieldEnd) + `(limit: ${max})` + gql.slice(argsEnd, bodyEnd);
    }
    i = bodyEnd;
  }
  return out + gql.slice(end);
}

module.exports = { addListLimits, MAX_ROWS };
