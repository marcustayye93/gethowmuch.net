/* dom-qa.js — run the REAL guided.js in node against a minimal DOM shim,
 * drive the full user flow, assert the outcomes. Run: node dom-qa.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { document, qsa, El, payload, docListeners } = require("./dom-shim.js");

/* ---------- load the real guided.js ---------- */
const jsSrc = fs.readFileSync(path.join(__dirname, "guided.js"), "utf8");
eval(jsSrc);

/* ---------- drive the flow ---------- */
let failures = 0;
function check(name, cond) { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) failures++; }
function click(el) { (docListeners.click || []).forEach(fn => fn({ target: el })); }
const visible = id => !document.getElementById(id).classList.contains("hidden");

setTimeout(() => {
  try {
    check("landing visible on load", visible("view-landing"));
    click(document.getElementById("startBtn"));
    check("q1 visible after start", visible("view-q1"));
    const chips = document.querySelectorAll("#interestChips .chip");
    check("10 interest chips", chips.length === 10);
    // toggle two chips via container handler
    const ic = document.getElementById("interestChips");
    (ic._listeners.click || []).forEach(fn => fn({ target: chips[0] }));
    (ic._listeners.click || []).forEach(fn => fn({ target: chips[1] }));
    check("chips toggle on", chips[0].getAttribute("aria-pressed") === "true");
    click(document.querySelector('[data-next="q2"]'));
    check("q2 visible", visible("view-q2"));
    const rf = document.getElementById("roleFilter");
    rf.value = "data";
    (rf._listeners.input || []).forEach(fn => fn({}));
    const opts = document.querySelectorAll("#roleList .roleopt");
    const names = opts.map(o => o.textContent.toLowerCase());
    check("type-to-filter narrows (" + opts.length + " opts)",
      opts.length > 0 && opts.length < 172 && names.every(n => n.includes("data") || n.includes("not listed")));
    const pick = opts[0]; // first filtered option, whatever it is
    const pickId = pick.getAttribute("data-id");
    const rl = document.getElementById("roleList");
    (rl._listeners.click || []).forEach(fn => fn({ target: pick }));
    const repick = document.querySelector('#roleList .roleopt[data-id="' + pickId + '"]');
    check("role selected", repick && repick.getAttribute("aria-selected") === "true");
    click(document.querySelector('[data-next="q3"]'));
    check("q3 visible", visible("view-q3"));
    const wchips = document.querySelectorAll("#willChips .chip");
    check("4 willingness chips", wchips.length === 4);
    const wc = document.getElementById("willChips");
    (wc._listeners.click || []).forEach(fn => fn({ target: wchips[2] }));
    click(document.getElementById("seeResults"));
    check("results visible", visible("view-results"));
    const cards = document.querySelectorAll("#cards .card");
    const want = payload.filter(r => r.tags.includes("T01") || r.tags.includes("T02")).length;
    check("consideration set = OR of T01,T02 (" + cards.length + "/" + want + ")", cards.length === want);
    const titles = cards.map(c => c.querySelector("h3").textContent);
    const sorted = [...titles].sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
    check("results alphabetical", JSON.stringify(titles) === JSON.stringify(sorted));
    const statics = document.querySelectorAll("#cards .card .chip-static");
    check("shared-skills chip present", statics.some(c => c.textContent.includes("Uses skills from your current role")));
    check("band chips present", statics.some(c => /pay band|No pay band/.test(c.textContent)));
    check("wage footnote mentions MRSD, MOM", document.getElementById("wageNote").textContent.includes("MRSD, MOM"));
    // browse all
    click(document.getElementById("browseAll"));
    const all = document.querySelectorAll("#cards .card");
    check("browse-all shows 171", all.length === 171);
    // find never hides
    const fb = document.getElementById("findBox");
    fb.value = "nurse";
    (fb._listeners.input || []).forEach(fn => fn({}));
    const after = document.querySelectorAll("#cards .card");
    check("find hides nothing", after.length === 171);
    check("find highlights", document.querySelectorAll("#cards mark").length > 0);
    // back button
    click(document.querySelector('[data-back="q1"]'));
    check("change answers returns to q1", visible("view-q1"));
  } catch (e) { console.log("FAIL exception: " + e.stack.split("\n").slice(0, 3).join(" | ")); failures++; }
  console.log(failures === 0 ? "QA ALL GREEN" : "QA " + failures + " FAILURES");
  process.exit(failures ? 1 : 0);
}, 300);
