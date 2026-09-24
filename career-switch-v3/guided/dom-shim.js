"use strict";
const fs = require("fs");
const path = require("path");
/* ---------- tiny DOM ---------- */
const SELF_CLOSING = new Set(["input", "br", "img", "meta", "link", "hr"]);
class El {
  constructor(tag, attrs) {
    this.tag = tag; this.attrs = attrs || {}; this.children = []; this.parent = null;
    this._listeners = {}; this.value = ""; this._text = null;
  }
  get id() { return this.attrs.id || ""; }
  get className() { return this.attrs.class || ""; }
  scrollIntoView() {}
  getAttribute(n) { return this.attrs.hasOwnProperty(n) ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return this.attrs.hasOwnProperty(n); }
  get classList() {
    const self = this;
    const set = new Set((self.attrs.class || "").split(/\s+/).filter(Boolean));
    return {
      contains: c => set.has(c),
      toggle: (c, force) => {
        const want = force === undefined ? !set.has(c) : !!force;
        want ? set.add(c) : set.delete(c);
        self.attrs.class = [...set].join(" ");
        return want;
      },
      add: c => { set.add(c); self.attrs.class = [...set].join(" "); },
    };
  }
  get textContent() {
    if (this._text !== null) return this._text;
    return this.children.map(c => (typeof c === "string" ? c : c.textContent)).join("");
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this.children.map(c => (typeof c === "string" ? escText(c) : c.outer())).join(""); }
  set innerHTML(h) { this._text = null; this.children = parseFragment(h, this); }
  outer() {
    const a = Object.entries(this.attrs).map(([k, v]) => ` ${k}="${escText(v)}"`).join("");
    if (SELF_CLOSING.has(this.tag)) return `<${this.tag}${a}>`;
    return `<${this.tag}${a}>${this.innerHTML}</${this.tag}>`;
  }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  querySelectorAll(sel) { return qsa(this, sel); }
  querySelector(sel) { return qsa(this, sel)[0] || null; }
  closest(sel) { let e = this; while (e) { if (matchSel(e, sel)) return e; e = e.parent; } return null; }
}
function escText(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function parseFragment(html, parent) {
  const nodes = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)(\/?)>/g;
  const stack = [];
  let last = 0, m;
  const pushText = upTo => { const t = html.slice(last, upTo); if (t) (stack[stack.length - 1] || { children: nodes }).children.push(t); };
  while ((m = re.exec(html))) {
    pushText(m.index);
    const [, close, tag, attrStr, selfClose] = m;
    if (close) { stack.pop(); }
    else {
      const attrs = {};
      const are = /([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:="([^"]*)")?/g;
      let am; while ((am = are.exec(attrStr))) attrs[am[1]] = am[2] === undefined ? "" : am[2];
      const el = new El(tag.toLowerCase(), attrs); el.parent = stack[stack.length - 1] || parent || null;
      (stack[stack.length - 1] ? stack[stack.length - 1].children : nodes).push(el);
      if (!selfClose && !SELF_CLOSING.has(el.tag)) stack.push(el);
    }
    last = re.lastIndex;
  }
  pushText(html.length);
  return nodes;
}

function matchSimple(el, part) {
  if (!(el instanceof El)) return false;
  let rest = part;
  const idm = rest.match(/#([A-Za-z0-9_-]+)/); if (idm) { if (el.getAttribute("id") !== idm[1]) return false; rest = rest.replace(idm[0], ""); }
  const clsm = rest.match(/\.([A-Za-z0-9_-]+)/); if (clsm) { if (!el.classList.contains(clsm[1])) return false; rest = rest.replace(clsm[0], ""); }
  const atm = rest.match(/\[([A-Za-z0-9_-]+)(?:="([^"]*)")?\]/);
  if (atm) { const v = el.getAttribute(atm[1]); if (atm[2] !== undefined ? v !== atm[2] : v === null) return false; rest = rest.replace(atm[0], ""); }
  rest = rest.trim();
  if (rest && el.tag !== rest.toLowerCase()) return false;
  return true;
}
function matchSel(el, sel) {
  const parts = sel.trim().split(/\s+/);
  // rightmost part must match the element itself; earlier parts match ancestors
  if (!matchSimple(el, parts[parts.length - 1])) return false;
  let cur = el.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (cur && !matchSimple(cur, parts[i])) cur = cur.parent;
    if (!cur) return false;
    cur = cur.parent;
  }
  return true;
}
function qsa(root, sel) {
  const out = [];
  const walk = n => { if (n instanceof El) { if (matchSel(n, sel)) out.push(n); n.children.forEach(walk); } };
  walk(root);
  return out;
}

/* ---------- document / window ---------- */
const htmlSrc = fs.readFileSync(path.join(__dirname, "guided.html"), "utf8");
const bodySrc = htmlSrc.split("<body>")[1].split("</body>")[0];
const body = new El("body", {});
body.children = parseFragment(bodySrc, body);

const payload = JSON.parse(fs.readFileSync(path.join(__dirname, "guided-payload.json"), "utf8"));
const docListeners = {};
const document = {
  getElementById: id => qsa(body, "#" + id)[0] || null,
  querySelectorAll: sel => qsa(body, sel),
  querySelector: sel => qsa(body, sel)[0] || null,
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  createElement: t => new El(t, {}),
  body,
};
global.window = { scrollTo: () => {} };
global.document = document;
global.fetch = url => Promise.resolve({ json: () => Promise.resolve(payload) });


module.exports = { document, qsa, El, payload, docListeners };
