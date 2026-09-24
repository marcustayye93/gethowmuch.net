/* guided.js — career-switch guided questionnaire.
 *
 * Hard rules (from the Grok review, locked):
 * - Boolean tag overlap only. No weights, no scores, no counts, no tiers.
 * - Output order is the payload order: alphabetical by name, tie-break on id.
 *   Nothing in this file re-sorts by band, overlap, or path length.
 * - No function here takes a band and a number and returns a boolean.
 * - The find box highlights and scrolls. It never hides a role.
 * - "See all 171 roles" clears the interest filter in place, same view.
 * - Nothing the user enters leaves the page: no network calls at all.
 */
(function () {
"use strict";

var TAGS = {
  T01: "Working with people",
  T02: "Hands-on work",
  T03: "Working outdoors",
  T04: "Shift work",
  T05: "Desk and computer work",
  T06: "Caring for others",
  T07: "Creative work",
  T08: "Data and analysis",
  T09: "Operating vehicles or machinery",
  T10: "Teaching or training"
};

var WILLING = [
  ["study", "Studying part-time"],
  ["licence", "Getting a licence"],
  ["shifts", "Shift work"],
  ["physical", "Physical work"]
];

var LIC_CHIP = {
  licence: "Licence required",
  cert: "Certification needed",
  portfolio: "Portfolio expected",
  employer: "Employer-sponsored entry"
};

var MAP_CHIP = {
  exact: "Official pay band",
  proxy: "Closest-match pay band",
  withheld: "No pay band published"
};

var WAGE_NOTE = "Pay bands are gross monthly wages, June 2025, for full-time " +
  "resident employees who held the job then. They are what incumbents earned, " +
  "not what a new entrant would be offered. The 25th percentile is not starting " +
  "pay. Gross includes overtime, commissions and allowances; excludes bonuses; " +
  "before employee CPF deduction. Source: MRSD, MOM.";

var state = {
  payload: null,
  interests: [],   // selected tag ids
  currentRole: null, // role id, or "not-listed", or null (skipped)
  willing: []        // selected willingness ids
};

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c];
  });
}
function money(n) { return "$" + Number(n).toLocaleString("en-SG"); }

function show(id) {
  ["view-landing", "view-q1", "view-q2", "view-q3", "view-results"].forEach(function (v) {
    $(v).classList.toggle("hidden", v !== id);
  });
  window.scrollTo(0, 0);
}

/* Matching: boolean OR. A role is in the set when at least one of its tags
 * is among the selected interests. No selection means every role. */
function inSet(role) {
  if (state.interests.length === 0) return true;
  for (var i = 0; i < role.tags.length; i++) {
    if (state.interests.indexOf(role.tags[i]) !== -1) return true;
  }
  return false;
}

function chip(text, hot) {
  return '<span class="chip-static' + (hot ? " hot" : "") + '">' + esc(text) + "</span>";
}

function cardHTML(role) {
  var chips = [];
  chips.push(chip(MAP_CHIP[role.map] || role.map));
  if (LIC_CHIP[role.lic]) chips.push(chip(LIC_CHIP[role.lic]));
  if (!role.path) chips.push(chip("Reskill path not yet researched", true));
  if (state.currentRole && state.currentRole !== "not-listed") {
    var cur = byId(state.currentRole);
    if (cur && overlap(cur.tags, role.tags)) {
      chips.push(chip("Uses skills from your current role"));
    }
  }
  var band = "";
  if (role.floor != null && role.ceil != null) {
    band = '<div class="band">' + money(role.floor) + " \u2013 " + money(role.ceil) +
      ' <span style="font-family:inherit;font-size:12.5px;color:var(--muted)">gross / month</span></div>';
  }
  var path = role.pathline
    ? '<p class="pathline">' + esc(role.pathline) + "</p>"
    : "";
  return '<article class="card" data-name="' + esc(role.name.toLowerCase()) + '">' +
    "<h3>" + esc(role.name) + "</h3>" + band +
    '<div class="cardchips">' + chips.join("") + "</div>" + path +
    '<p class="fine">' + esc(WAGE_NOTE_SHORT) + "</p></article>";
}
var WAGE_NOTE_SHORT = "Gross monthly, incumbents, Jun 2025. Not entry pay.";

function byId(id) {
  for (var i = 0; i < state.payload.length; i++) {
    if (state.payload[i].id === id) return state.payload[i];
  }
  return null;
}
function overlap(a, b) {
  for (var i = 0; i < a.length; i++) {
    if (b.indexOf(a[i]) !== -1) return true;
  }
  return false;
}

function renderResults() {
  var cards = $("cards");
  var html = [];
  for (var i = 0; i < state.payload.length; i++) {
    var role = state.payload[i];
    if (inSet(role)) html.push(cardHTML(role));
  }
  cards.innerHTML = html.join("");

  var bits = [];
  if (state.interests.length) {
    bits.push("<b>You picked:</b> " + state.interests.map(function (t) { return esc(TAGS[t]); }).join(", "));
  } else {
    bits.push("<b>You skipped the work question</b>, so this is every role.");
  }
  if (state.currentRole && state.currentRole !== "not-listed") {
    bits.push("<b>Current role:</b> " + esc(byId(state.currentRole).name));
  } else if (state.currentRole === "not-listed") {
    bits.push("<b>Current role:</b> not listed, so no skill overlap is shown.");
  }
  if (state.willing.length) {
    var wl = WILLING.filter(function (w) { return state.willing.indexOf(w[0]) !== -1; })
      .map(function (w) { return esc(w[1]); }).join(", ");
    bits.push("<b>You are open to:</b> " + wl + ". These only add notes; nothing was removed.");
  }
  $("recap").innerHTML = bits.join(" &middot; ");
  $("wageNote").textContent = WAGE_NOTE + " Source wording per MOM: MRSD, MOM.";
  $("findBox").value = "";
  show("view-results");
}

/* Find: highlight matches and scroll to the first. Never hides. */
function wireFind() {
  var box = $("findBox");
  box.addEventListener("input", function () {
    var q = box.value.trim().toLowerCase();
    var cards = $("cards").querySelectorAll(".card");
    var first = null;
    cards.forEach(function (c) {
      var h3 = c.querySelector("h3");
      var name = c.getAttribute("data-name");
      if (q && name.indexOf(q) !== -1) {
        h3.innerHTML = esc(h3.textContent).replace(
          new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"), "<mark>$1</mark>");
        if (!first) first = c;
      } else {
        h3.textContent = h3.textContent;
      }
    });
    if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function wireChips(containerId, onToggle) {
  var el = $(containerId);
  el.addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var on = b.getAttribute("aria-pressed") === "true";
    b.setAttribute("aria-pressed", on ? "false" : "true");
    onToggle(b.getAttribute("data-id"), !on);
  });
}

function renderRoleList(filter) {
  var q = (filter || "").trim().toLowerCase();
  var list = $("roleList");
  var html = [];
  state.payload.forEach(function (r) {
    if (q && r.name.toLowerCase().indexOf(q) === -1) return;
    var sel = state.currentRole === r.id ? ' aria-selected="true"' : "";
    html.push('<button class="roleopt" data-id="' + r.id + '"' + sel + ">" + esc(r.name) + "</button>");
  });
  var selN = state.currentRole === "not-listed" ? ' aria-selected="true"' : "";
  html.push('<button class="roleopt" data-id="not-listed"' + selN + ">My role is not listed</button>");
  list.innerHTML = html.join("");
}

function init(data) {
  state.payload = data;

  // Q1 interest chips
  var ic = $("interestChips");
  ic.innerHTML = Object.keys(TAGS).map(function (t) {
    return '<button class="chip" data-id="' + t + '" aria-pressed="false">' + esc(TAGS[t]) + "</button>";
  }).join("");
  wireChips("interestChips", function (id, on) {
    var i = state.interests.indexOf(id);
    if (on && i === -1) state.interests.push(id);
    if (!on && i !== -1) state.interests.splice(i, 1);
  });

  // Q3 willingness chips
  var wc = $("willChips");
  wc.innerHTML = WILLING.map(function (w) {
    return '<button class="chip" data-id="' + w[0] + '" aria-pressed="false">' + esc(w[1]) + "</button>";
  }).join("");
  wireChips("willChips", function (id, on) {
    var i = state.willing.indexOf(id);
    if (on && i === -1) state.willing.push(id);
    if (!on && i !== -1) state.willing.splice(i, 1);
  });

  // Q2 role picker
  renderRoleList("");
  $("roleFilter").addEventListener("input", function () { renderRoleList($("roleFilter").value); });
  $("roleList").addEventListener("click", function (e) {
    var b = e.target.closest(".roleopt");
    if (!b) return;
    state.currentRole = b.getAttribute("data-id");
    renderRoleList($("roleFilter").value);
  });

  // Navigation
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.id === "startBtn") { show("view-q1"); return; }
    if (t.id === "seeResults") { renderResults(); return; }
    if (t.id === "browseAll") {
      state.interests = [];
      ic.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      renderResults();
      return;
    }
    var next = t.getAttribute && t.getAttribute("data-next");
    if (next) { show("view-" + next); return; }
    var back = t.getAttribute && t.getAttribute("data-back");
    if (back) { show("view-" + back); return; }
    if (t.hasAttribute && t.hasAttribute("data-skip")) {
      var map = { q1: "view-q2", q2: "view-q3", q3: null };
      if (map[t.getAttribute("data-skip")]) show(map[t.getAttribute("data-skip")]);
      else renderResults();
      return;
    }
    if (t.hasAttribute && t.hasAttribute("data-exit")) { renderResults(); return; }
  });

  wireFind();
}

fetch("guided-payload.json")
  .then(function (r) { return r.json(); })
  .then(init)
  .catch(function () {
    $("view-landing").innerHTML = "<p>Sorry, the career data could not be loaded. Please try again.</p>";
  });
})();
