/* Career Switch Calculator v2.0 — engine layer (SPEC-v2.0-draft.md, Draft 3).
   Sits ON TOP of the frozen v1 engine (window.CareerEngine, SPEC v4 formula
   layer closed 19 Sep 2026). This file never touches G1/G2, g, F1/F1b/F2/F4
   or the cash math: it adds the F0 eligibility stage, benchmark row,
   tautology guard, reframe rule, passion presentation and lever sweeps.
   UMD: window.CareerEngineV2 in browser, module.exports in node (for tests). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.CareerEngineV2 = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.CareerEngine) ||
          (typeof require === 'function' ? require('./engine.js') : null);
  if (!E) throw new Error('CareerEngineV2 requires the v1 CareerEngine');

  var TIMELINE_KEYS = ['asap', '6-12', '1-2y', 'exploring'];
  var BELOW_DEGREE = { olevel: true, diploma: true };
  var GUARD_RATIO = 1.2; // spec open question 1: fixed margin, kept as the honest default
  var TIER2_CAP = 3;

  // One-tap kill-switch config. tier2:false hides Tier 2 without a release.
  var config = { tier2: true };
  try {
    var saved = (typeof localStorage !== 'undefined') && localStorage.getItem('ghm-cs-v2-config');
    if (saved) { var p = JSON.parse(saved); if (typeof p.tier2 === 'boolean') config.tier2 = p.tier2; }
  } catch (e) {}

  // ---- instrumentation (client emits; aggregation + alerting are server-side) ----
  var Instrument = {
    emit: function (name, data) {
      var ev = { t: new Date().toISOString(), name: name, data: data || {} };
      try {
        if (typeof localStorage !== 'undefined') {
          var buf = JSON.parse(localStorage.getItem('ghm-cs-v2-events') || '[]');
          buf.push(ev);
          if (buf.length > 200) buf = buf.slice(buf.length - 200);
          localStorage.setItem('ghm-cs-v2-events', JSON.stringify(buf));
        }
      } catch (e) {}
      if (typeof console !== 'undefined' && console.debug) console.debug('[v2]', name, data || {});
    }
  };

  // ---- F0c credential chips (spec section 4) ----
  var CHIPS = {
    accountant: {
      roleChip: 'accountant',
      question: 'Do you already hold a recognised accounting degree?',
      yesMonths: 9, noMonths: 36,
      gateCopy: 'recognised accounting degree (or equivalent papers path)',
      accaNote: 'Yes = ACCA-papers path, about 9 months. No = the degree route, about 36 months.'
    },
    nurse: {
      roleChip: 'nurse',
      question: 'Are you SNB registered?',
      yesMonths: 0, noMonths: 27,
      gateCopy: 'SNB registration',
      accaNote: 'Yes = already licensed, no reskill wait. The enrolled-in-a-programme branch is held until the remaining-time figure is sourced.'
    },
    plumber: {
      roleChip: 'plumber',
      question: null, // hidden until BCA/PUB documentation confirms the 24-month figure
      yesMonths: 24, noMonths: 36,
      gateCopy: 'BCA Builder Certificate (or equivalent)',
      accaNote: 'About 36 months. The yes/no chip is hidden until the 24-month figure is sourced.'
    }
  };

  function chipFor(role) {
    var id = role.v2 && role.v2.chip;
    return id ? CHIPS[id] : null;
  }

  // Clone a role with the chip answer applied. The chip overrides the role's
  // time cost (used by F2/F3 and the cash math) — never anything else.
  function applyChip(role, answer) {
    var chip = chipFor(role);
    if (!chip || !answer) return role;
    var months = answer === 'yes' ? chip.yesMonths : chip.noMonths;
    var clone = {};
    for (var k in role) clone[k] = role[k];
    clone.reskill_months = months;
    clone.gates = {};
    for (var g in (role.gates || {})) clone.gates[g] = role.gates[g];
    clone.gates.licenceMonths = months;
    clone.v2 = { chip: role.v2.chip, gateMonths: months, chipAnswer: answer };
    return clone;
  }

  // v1 F3 check, mirrored so F0c can route chip roles to Gated paths before
  // the main filter run. Conditions identical to engine.js filterRoles.
  function f3killed(role, user) {
    var cap = E.TIMELINE_CAPS[user.timeline];
    var gates = role.gates || {};
    var rank = { citizen: 3, pr: 2, ep: 1 };
    var need = rank[gates.minResidency] || 1;
    if ((rank[user.residency] || 1) < need) return true;
    if (gates.licenceMonths != null && gates.licenceMonths > cap) return true;
    return false;
  }

  function isBelowDegree(user) {
    return !!BELOW_DEGREE[user.education];
  }

  // ---- F0a + L2 + chip prep: returns {pool, gated} ----
  // gated entries: {role, kind:'f0a'|'f3', chipId}
  function f0stage(user, roles, chipAnswers) {
    var gated = [];
    var pool = roles.filter(function (r) {
      return !(user.currentRoleId && r.id === user.currentRoleId); // L2
    });
    // F0a: below-degree holders never see the accountant chip; the role is
    // routed to Gated paths with the degree priced as copy, not math.
    var rest = [];
    pool.forEach(function (r) {
      if (r.v2 && r.v2.chip === 'accountant' && isBelowDegree(user)) {
        gated.push({ role: r, kind: 'f0a', chipId: 'accountant' });
      } else rest.push(r);
    });
    pool = rest;
    // Apply answered chips, then route F3-killed chip roles to Gated paths.
    // Unanswered chip roles are F3-checked at their worst-case gate
    // (chip.noMonths): the gate is real until the user answers.
    var out = [];
    pool.forEach(function (r) {
      var chip = chipFor(r);
      var ans = chip ? chipAnswers[chip.roleChip] : null;
      // Accountant chip is degree-holders only (F0a handled the rest).
      if (chip && chip.roleChip === 'accountant' && isBelowDegree(user)) ans = null;
      var role = applyChip(r, ans);
      var checkRole = (chip && !ans) ? withGateMonths(role, chip.noMonths) : role;
      if (chip && !ans && f3killed(checkRole, user)) {
        gated.push({ role: role, kind: 'f3', chipId: chip.roleChip });
      } else {
        out.push(role);
      }
    });
    return { pool: out, gated: gated };
  }

  function withGateMonths(role, months) {
    var clone = {};
    for (var k in role) clone[k] = role[k];
    clone.gates = {};
    for (var g in (role.gates || {})) clone.gates[g] = role.gates[g];
    clone.gates.licenceMonths = months;
    return clone;
  }

  // ---- main pipeline: F0 -> F1-F4 -> rank -> F0b tiers ----
  function pipeline(user, roles, chipAnswers) {
    var st = f0stage(user, roles, chipAnswers || {});
    var analyses = {};
    st.pool.forEach(function (r) { analyses[r.id] = E.cashAnalysis(r, user); });
    var f = E.filterRoles(st.pool, user, analyses);
    var ranked = E.rankRoles(f.ranked, user);

    // F0b two-tier presentation.
    var targets = user.targetDomains || [];
    function matchRank(r) {
      var best = -1;
      if (targets.indexOf(r.domain_primary) >= 0) best = targets.indexOf(r.domain_primary);
      (r.domain_adjacent || []).forEach(function (a) {
        var i = targets.indexOf(a);
        if (i >= 0 && (best < 0 || i < best)) best = i;
      });
      return best;
    }
    var tier1 = [], restPool = [];
    ranked.forEach(function (it) {
      (matchRank(it.role) >= 0 ? tier1 : restPool).push(it);
    });
    // Tier 2: cap 3, 36-month money delta desc, from F0-F4 survivors only.
    var tier2 = restPool.slice().sort(function (a, b) {
      return b.analysis.delta36 - a.analysis.delta36;
    }).slice(0, TIER2_CAP);
    // Tier 2 only when Tier 1 is empty. A role outside the user's ranked
    // passions never outranks their picks on money alone.
    var trigger = null;
    if (tier2.length && config.tier2 && !(user.passionOnly)) {
      if (tier1.length === 0) trigger = 'a';
    }
    if (!trigger) tier2 = [];
    return {
      tier1: tier1, tier2: tier2, tier2trigger: trigger,
      quarantined: f.quarantined, killed: f.killed,
      gated: st.gated, analyses: analyses,
      survivors: tier1.concat(tier2)
    };
  }

  // ---- benchmark (spec section 5): a pay path, not a role ----
  function benchmark(user) {
    var cur = user.current_pay;
    var label = user.currentDomain ? domainLabel(user.currentDomain) : 'Your current pay';
    return {
      label: label,
      m36: cur * 36,
      m120: cur * 120,
      lines: [
        "Assumes your pay doesn't move.",
        'Your pay is yours. Switch pay is the median for that role.'
      ],
      caveat120: 'Over ten years this assumes your pay never moves. Read it as scale, not a forecast.'
    };
  }

  function domainLabel(tag) {
    var names = { tech: 'Tech', data: 'Data', design: 'Design', marketing: 'Marketing',
      finance: 'Finance', people: 'People', healthcare: 'Healthcare',
      trades: 'Trades', hospitality: 'Hospitality', retail: 'Retail', ops: 'Ops' };
    return names[tag] || tag;
  }

  function median(xs) {
    if (!xs.length) return null;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // ---- tautology guard (spec section 5, L5) ----
  function tautologyGuard(user, survivors) {
    if (!user.currentDomain) return false; // disabled on the something-else path
    if (!survivors.length) return false;
    var med = median(survivors.map(function (it) { return it.role.settled_pay; }));
    if (med == null) return false;
    var moneyWin = survivors.every(function (it) { return it.analysis.delta36 <= 0; });
    return moneyWin && user.current_pay >= GUARD_RATIO * med;
  }

  var GUARD_COPY = "Your pay beats the settled pay of every switch here. That's a fact about your pay, not about these switches.";

  // ---- reframe (spec section 6) ----
  function reframe(user, pipe) {
    var survivors = pipe.survivors;
    if (!survivors.length) return { key: 'empty' };
    var moneyWin = survivors.every(function (it) { return it.analysis.delta36 <= 0; });
    if (!moneyWin) return { key: 'none' };
    var best = -Infinity;
    survivors.forEach(function (it) { if (it.analysis.delta36 > best) best = it.analysis.delta36; });
    var gap = -best; // S$X: stay beats the best switch by this over 36 months
    var lever = leverSweep(user, pipe);
    if (user.primary === 'money') {
      return { key: 'stay-money', gap: gap, lever: lever };
    }
    if (user.secondary === 'money') {
      return { key: 'stay-money-disclaimed', gap: gap, lever: lever };
    }
    return { key: 'unpriced' }; // no reframe; benchmark renders, v1 verdict + caption
  }

  // ---- lever line (spec section 6): two single-axis sweeps, 12 runs max ----
  function winsOnMoney(user, roles, chipAnswers) {
    var p = pipeline(user, roles, chipAnswers);
    return p.survivors.some(function (it) { return it.analysis.delta36 > 0; });
  }

  function leverSweep(user, pipe) {
    var roles = pipe._roles, chips = pipe._chips;
    // Sweep A: timeline bands strictly longer than the user's pick.
    if (user.timeline !== 'exploring') {
      var idx = TIMELINE_KEYS.indexOf(user.timeline);
      for (var i = idx + 1; i < TIMELINE_KEYS.length; i++) {
        var u2 = {};
        for (var k in user) u2[k] = user[k];
        u2.timeline = TIMELINE_KEYS[i];
        if (winsOnMoney(u2, roles, chips)) {
          return { kind: 'timeline', label: E.TIMELINE_LABELS[TIMELINE_KEYS[i]] };
        }
      }
    }
    // Sweep B: floor in S$250 steps down to floor - S$2,000.
    for (var f = user.min_viable - 250; f >= user.min_viable - 2000; f -= 250) {
      var u3 = {};
      for (var k2 in user) u3[k2] = user[k2];
      u3.min_viable = f;
      if (winsOnMoney(u3, roles, chips)) {
        return { kind: 'floor', value: f };
      }
    }
    return null;
  }

  // ---- passion presentation (spec section 7) ----
  function passionRank(role, targets) {
    var best = -1;
    var i = targets.indexOf(role.domain_primary);
    if (i >= 0) best = i;
    (role.domain_adjacent || []).forEach(function (a) {
      var j = targets.indexOf(a);
      if (j >= 0 && (best < 0 || j < best)) best = j;
    });
    return best;
  }

  function primaryMatch(role, targets) {
    return targets.indexOf(role.domain_primary) >= 0;
  }

  function provenance(role, targets) {
    var r = passionRank(role, targets);
    if (r < 0) return null;
    var tag = domainLabel(targets[r]).toLowerCase();
    if (primaryMatch(role, targets) && role.domain_primary === targets[r]) {
      return 'On the list because you ranked ' + tag + ' #' + (r + 1) + '.';
    }
    // adjacent-only match (or primary matched at a worse rank than adjacent)
    var adjTag = null;
    (role.domain_adjacent || []).forEach(function (a) {
      if (targets.indexOf(a) === r) adjTag = a;
    });
    var shown = domainLabel(adjTag || role.domain_primary).toLowerCase();
    return 'On the list because ' + shown + ' sits next to your #' + (r + 1) + ' pick.';
  }

  function orderTier1(tier1, user) {
    var targets = user.targetDomains || [];
    var groups = {};
    tier1.forEach(function (it) {
      var r = passionRank(it.role, targets);
      var key = r < 0 ? 'x' : String(r);
      (groups[key] = groups[key] || []).push(it);
    });
    var keys = Object.keys(groups).sort(function (a, b) {
      if (a === 'x') return 1;
      if (b === 'x') return -1;
      return (+a) - (+b);
    });
    keys.forEach(function (k) {
      groups[k].sort(function (a, b) { return b.analysis.delta36 - a.analysis.delta36; });
    });
    return keys.map(function (k) {
      return { rank: k === 'x' ? -1 : +k, items: groups[k] };
    });
  }

  // ---- top-level analyze ----
  function analyze(user, roles, chipAnswers) {
    var chips = chipAnswers || {};
    var pipe = pipeline(user, roles, chips);
    pipe._roles = roles;
    pipe._chips = chips;
    var bench = benchmark(user);
    var guard = tautologyGuard(user, pipe.survivors);
    var verdict;
    if (guard) {
      verdict = { key: 'guard', copy: GUARD_COPY, lever: leverSweep(user, pipe) };
    } else {
      verdict = reframe(user, pipe);
      if (verdict.key === 'unpriced') {
        verdict.v1verdict = E.alignmentVerdict(user, pipe.survivors);
        verdict.caption = "This tool prices money. It can't price " +
          (E.DIM_LABELS[user.primary] || user.primary) + '.';
      }
    }
    // v1 pushbacks still apply (P2 fires against the benchmark row).
    var pb = E.pushbacks(user, pipe.survivors, pipe.quarantined, pipe.killed,
      pipe._roles.filter(function (r) { return !(user.currentRoleId && r.id === user.currentRoleId); }));
    // v2 rewrites P6 in plain language (v1 engine.js copy untouched).
    pb = pb.map(function (p) {
      if (p.id !== 'P6') return p;
      var pool = pipe.survivors.concat(pipe.quarantined).filter(function (r) { return r.analysis.monthsBelow.count > 0; });
      if (!pool.length) return p;
      var worst = pool.slice().sort(function (a, b) { return b.analysis.monthsBelow.count - a.analysis.monthsBelow.count; })[0];
      var mb = worst.analysis.monthsBelow;
      var hh = user.floorQualifier === 'household' ? " (the household's)" : '';
      p.copy = worst.role.title + ' pays under your ' + E.money(user.min_viable) + '/mo floor' + hh +
        ' for ' + mb.count + ' months: ' + mb.unpaid + ' with no pay while you retrain, then ' +
        mb.employed + ' earning below your floor. Your savings have to bridge that stretch.';
      return p;
    });
    var n = pipe.survivors.length;
    return {
      benchmark: bench,
      tautology: guard,
      verdict: verdict,
      tier1: pipe.tier1,
      tier2: pipe.tier2,
      tier2trigger: pipe.tier2trigger,
      orderedTier1: orderTier1(pipe.tier1, user),
      quarantined: pipe.quarantined,
      killed: pipe.killed,
      gated: pipe.gated,
      survivors: pipe.survivors,
      lowSurvivor: n === 1 || n === 2,
      pushbacks: pb,
      p7: function (role) { return E.p7(role, user, user.primary); },
      changed: Object.keys(chips).some(function (k) { return chips[k]; }),
      analyses: pipe.analyses
    };
  }

  return {
    config: config,
    Instrument: Instrument,
    CHIPS: CHIPS,
    GUARD_COPY: GUARD_COPY,
    applyChip: applyChip,
    f3killed: f3killed,
    f0stage: f0stage,
    pipeline: pipeline,
    benchmark: benchmark,
    domainLabel: domainLabel,
    tautologyGuard: tautologyGuard,
    reframe: reframe,
    leverSweep: leverSweep,
    passionRank: passionRank,
    provenance: provenance,
    orderTier1: orderTier1,
    analyze: analyze
  };
});
