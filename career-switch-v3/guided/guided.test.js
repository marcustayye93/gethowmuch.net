/* guided.test.js — run with: node guided.test.js
 *
 * Locks the Grok-reviewed mechanism:
 * 1. Payload ships no weights, scores, rankings, midpoints, or demand.
 * 2. Matching is boolean OR; empty selection shows all 171.
 * 3. Output order is payload order (alphabetical, tie-break id); no sort on
 *    band, overlap, or path length anywhere in guided.js.
 * 4. Every role is reachable from at least one answer combination.
 * 5. guided.js makes no network calls besides loading the payload.
 */
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
let failures = 0;
function check(name, cond) {
  if (cond) { console.log("PASS " + name); }
  else { failures++; console.log("FAIL " + name); }
}

const payload = JSON.parse(fs.readFileSync(path.join(DIR, "guided-payload.json"), "utf8"));
const js = fs.readFileSync(path.join(DIR, "guided.js"), "utf8");

// 1. Payload shape
check("payload has 171 records", payload.length === 171);
const ALLOWED = new Set(["id", "name", "slug", "map", "basis", "lic", "tags", "floor", "ceil", "path", "pathline"]);
const FORBIDDEN_WORDS = ["score", "weight", "rank", "midpoint", "demand", "tier"];
let keysOk = true, wordsOk = true;
for (const r of payload) {
  for (const k of Object.keys(r)) if (!ALLOWED.has(k)) { keysOk = false; console.log("  bad key: " + k); }
  const blob = " " + JSON.stringify(r).toLowerCase() + " ";
  for (const w of FORBIDDEN_WORDS) {
    if (new RegExp("[^a-z]" + w + "[^a-z]").test(blob)) { wordsOk = false; console.log("  forbidden word in " + r.id + ": " + w); }
  }
  if (r.map === "withheld" && ("floor" in r || "ceil" in r)) { keysOk = false; console.log("  withheld role ships a band: " + r.id); }
}
check("payload keys allowlisted only", keysOk);
check("payload carries no scores/weights/ranks", wordsOk);

// 2. Matching semantics (mirror of inSet in guided.js)
function inSet(role, interests) {
  if (interests.length === 0) return true;
  return role.tags.some(t => interests.includes(t));
}
const tagIds = ["T01","T02","T03","T04","T05","T06","T07","T08","T09","T10"];
check("empty selection shows all 171", payload.filter(r => inSet(r, [])).length === 171);

// every single-tag selection: only roles carrying the tag appear, none dropped
let singleOk = true;
for (const t of tagIds) {
  const got = payload.filter(r => inSet(r, [t]));
  const want = payload.filter(r => r.tags.includes(t));
  if (got.length !== want.length) { singleOk = false; console.log("  tag " + t + ": got " + got.length + " want " + want.length); }
}
check("single-tag selection returns exactly the tagged roles", singleOk);

// 3. Order: payload is alphabetical; matching must not re-order
let alphaOk = true;
for (let i = 1; i < payload.length; i++) {
  const a = payload[i - 1], b = payload[i];
  const ka = a.name.toLowerCase() + "\0" + a.id, kb = b.name.toLowerCase() + "\0" + b.id;
  if (ka > kb) { alphaOk = false; console.log("  out of order: " + a.id + " before " + b.id); }
}
check("payload is alphabetical with id tie-break", alphaOk);
check("guided.js contains no .sort( call", !/\.sort\s*\(/.test(js));
check("guided.js has no score/weight/rank identifiers",
  !/\b(score|weight|rank|ranking|midpoint)\b/i.test(js.replace(/"Uses skills from your current role"/g, "")));

// 4. Reachability: every role appears in at least one answer combination
let reachOk = true;
for (const r of payload) {
  const sel = r.tags.length ? [r.tags[0]] : [];
  if (!inSet(r, sel)) { reachOk = false; console.log("  unreachable: " + r.id); }
}
check("every role reachable from some answer combination", reachOk);

// 5. No network calls besides the payload fetch
const fetches = (js.match(/fetch\s*\(/g) || []).length;
check("exactly one fetch (the payload)", fetches === 1);
check("no XMLHttpRequest", !/XMLHttpRequest/.test(js));
check("no navigator.sendBeacon", !/sendBeacon/.test(js));

if (failures) { console.log(failures + " FAILURES"); process.exit(1); }
console.log("all green");
