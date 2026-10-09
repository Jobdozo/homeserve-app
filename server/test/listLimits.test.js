const { test } = require("node:test");
const assert = require("node:assert");
const { addListLimits } = require("../src/listLimits");

const L = (s) => addListLimits(s, 5000);
const squash = (s) => s.replace(/\s+/g, " ").trim();

test("a bare list field gets a limit", () => {
  assert.equal(squash(L("query { services { id name } }")), "query { services(limit: 5000) { id name } }");
});

test("a list field with a filter keeps it and gets the limit added", () => {
  assert.equal(
    squash(L('query { services(where: { status: { eq: "active" } }) { id } }')),
    'query { services(where: { status: { eq: "active" } }, limit: 5000) { id } }'
  );
  assert.equal(
    squash(L("query($id: UUID!) { bookings(where: { customerId: { eq: $id } }, orderBy: { createdAt: DESC }) { id } }")),
    "query($id: UUID!) { bookings(where: { customerId: { eq: $id } }, orderBy: { createdAt: DESC }, limit: 5000) { id } }"
  );
});

test("a limit that is already there is respected", () => {
  assert.equal(squash(L("query { activities(orderBy: { at: DESC }, limit: 20) { id } }")), "query { activities(orderBy: { at: DESC }, limit: 20) { id } }");
  assert.equal(squash(L("query($n: Int) { messages(limit: $n) { id } }")), "query($n: Int) { messages(limit: $n) { id } }");
});

test("a single row looked up by id or key is left alone", () => {
  assert.equal(squash(L("query($id: UUID!) { service(id: $id) { name } }")), "query($id: UUID!) { service(id: $id) { name } }");
  assert.equal(squash(L("query($k: UUID!) { provider_by_key(key: { id: $k }) { name } }")), "query($k: UUID!) { provider_by_key(key: { id: $k }) { name } }");
});

test("only root fields change; several roots each get one; nested fields are untouched", () => {
  assert.equal(
    squash(L("query { bookings { id service { id name } messages { text } } providers { id } service(id: \"x\") { id } }")),
    'query { bookings(limit: 5000) { id service { id name } messages { text } } providers(limit: 5000) { id } service(id: "x") { id } }'
  );
});

test("aliases, commas and braces inside strings are handled", () => {
  assert.equal(squash(L("query { svc: services { id }, cats: categories { slug } }")), "query { svc: services(limit: 5000) { id }, cats: categories(limit: 5000) { slug } }");
  assert.equal(
    squash(L('query { services(where: { name: { eq: "a { b ) c" } }) { id } }')),
    'query { services(where: { name: { eq: "a { b ) c" } }, limit: 5000) { id } }'
  );
});

test("the queries the app really uses all come out valid-looking (every root list has exactly one limit)", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "store.js"), "utf8");
  let checked = 0;
  for (const m of src.matchAll(/`(query[^`]*)`/g)) {
    const q = m[1].replace(/\$\{[^}]*\}/g, "x"); // template pieces like ${SERVICE_FIELDS}
    const out = addListLimits(q);
    assert.equal(out.split("{").length, q.split("{").length, "braces unchanged: " + q.slice(0, 60));
    assert.equal(out.split("(").length, out.split(")").length, "parentheses still balanced: " + out.slice(0, 80));
    assert.equal(addListLimits(out), out, "rewriting twice changes nothing");
    // a lookup by id is never given a limit
    if (/^\s*query[^{]*\{\s*[a-z]+\(id:/.test(q)) assert.equal(out, q);
    checked++;
  }
  assert.ok(checked > 10, "found the app's queries (" + checked + ")");
});
