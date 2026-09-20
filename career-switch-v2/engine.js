/* Career Switch Calculator — engine (Spec v4, formula layer closed 19 Sep 2026).
   Pure logic, no DOM. UMD: window.CareerEngine in browser, module.exports in node.
   The Section 7 worked example is the automated fixture in test/fixture.test.js:
   if any fixture cell moves, the spec has drifted. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.CareerEngine = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIMELINE_CAPS = { asap: 3, '6-12': 12, '1-2y': 24, exploring: 36 };
  var TIMELINE_KEYS = ['asap', '6-12', '1-2y', 'exploring'];
  var TIMELINE_LABELS = { asap: 'ASAP (3 months)', '6-12': '6–12 months', '1-2y': '1–2 years', exploring: 'just exploring (36 months)' };
  var OW_CEILING = 8000;
  var DRIFT = 0.03; // sensitivity only, 120-month card only. Never on the rank path.

  // Appendix A — employee CPF rates. Build defaults: PR = 3rd-year/full rates;
  // age band 55+ = Above 55-60 rate (18%). EP = no CPF.
  var EE_RATES = {
    citizen: { under40: 0.20, '40-54': 0.20, '55+': 0.18 },
    pr:      { under40: 0.20, '40-54': 0.20, '55+': 0.18 },
    ep:      { under40: 0.00, '40-54': 0.00, '55+': 0.00 }
  };
  var RES_RANK = { citizen: 3, pr: 2, ep: 1 };

  var DIM_LABELS = { money: 'money', time: 'time/freedom', meaning: 'meaning/passion', stability: 'stability' };

  function eeRate(ageBand, residency) {
    var t = EE_RATES[residency] || EE_RATES.citizen;
    return (t[ageBand] != null) ? t[ageBand] : 0.20;
  }

  // cash = G - employee_rate x min(G, 8000). The x0.80 shorthand is banned.
  function grossToCash(gross, ageBand, residency) {
    return gross - eeRate(ageBand, residency) * Math.min(gross, OW_CEILING);
  }

  // SkillsFuture nett = age x residency x subsidy class, never a role constant.
  function reskillNett(role, user) {
    if (user.residency === 'ep') return role.reskill_list_price || 0;
    if ((user.ageBand === '40-54' || user.ageBand === '55+') && role.reskill_nett_40plus != null) {
      return role.reskill_nett_40plus;
    }
    return role.reskill_nett_base != null ? role.reskill_nett_base : 0;
  }

  function switchPay(role, t, nett) {
    if (t <= role.reskill_months) return role.allowance || 0;
    var k = t - role.reskill_months; // employed month k = 1.. ; first employed month pays entry + one ramp step
    if (k <= 60) return role.entry_pay + (role.settled_pay - role.entry_pay) * k / 60;
    return role.settled_pay;
  }

  function cashAnalysis(role, user) {
    var cur = user.current_pay, floor = user.min_viable;
    var rc = reskillNett(role, user);
    function sum36(n, fn) { var s = 0; for (var t = 1; t <= n; t++) s += fn(t); return s; }

    var stay36 = cur * 36;
    var sw36 = sum36(36, function (t) { return switchPay(role, t); }) - rc;
    var delta36 = sw36 - stay36;

    // Months below floor: every calendar month with switch(t) < min_viable.
    var below = 0, unpaid = 0;
    for (var tb = 1; tb <= 120; tb++) {
      if (switchPay(role, tb) < floor) { below++; if (tb <= role.reskill_months) unpaid++; }
    }

    // 120-month window: dropped for age band 55+. Otherwise min(120, months to 65);
    // v1 only collects bands, so under-40 and 40-54 use the full 120.
    var delta120 = null, sensToday = null, sensDrift = null;
    if (user.ageBand !== '55+') {
      var stay120 = cur * 120;
      var sw120 = sum36(120, function (t) { return switchPay(role, t); }) - rc;
      delta120 = sw120 - stay120;
      // Sensitivity: 3% calendar drift on both bands, 120-month card only.
      var sStay = 0, sSw = 0;
      for (var t2 = 1; t2 <= 120; t2++) {
        var drifted = function (v) { return v * Math.pow(1 + DRIFT, t2 / 12); };
        sStay += drifted(cur);
        var e = drifted(role.entry_pay), s = drifted(role.settled_pay), v;
        if (t2 <= role.reskill_months) { v = role.allowance || 0; }
        else { var k2 = t2 - role.reskill_months; v = k2 <= 60 ? e + (s - e) * k2 / 60 : s; }
        sSw += v;
      }
      sensToday = delta120;
      sensDrift = (sSw - rc) - sStay;
    }

    var dip = role.entry_pay - cur;
    return {
      reskill_nett: rc,
      stay36: stay36,
      switch36net: sw36,
      delta36: delta36,
      delta120: delta120,
      sensToday: sensToday,
      sensDrift: sensDrift,
      monthsBelow: { count: below, unpaid: unpaid, employed: below - unpaid },
      dip: dip,
      dipPct: cur ? dip / cur : null,
      landing: role.settled_pay - cur,
      landingPct: cur ? (role.settled_pay - cur) / cur : null
    };
  }

  // Primary rubric score. "Near-ties" = exact ties on the primary rubric only.
  function rubricScore(role, dim) {
    if (dim === 'time') return 0.6 * (role.hours_score || 0) + 0.4 * (role.sovereignty_score || 0);
    if (dim === 'meaning') return role.meaning_score || 0;
    if (dim === 'stability') return role.stability_score || 0;
    return 0;
  }

  // Hard filters, locked order: F3 -> F1 -> F2 -> F1b -> F4.
  // F1b and F4 quarantine (shown separately); F3/F1/F2 kill.
  function filterRoles(roles, user, analyses) {
    var cap = TIMELINE_CAPS[user.timeline];
    var killed = { F3: 0, F1: 0, F2: 0 };
    var ranked = [], quarantined = [];
    roles.forEach(function (role) {
      var a = analyses[role.id];
      var gates = role.gates || {};
      // F3: licence / pass / citizenship gate unobtainable in time
      var needRank = RES_RANK[gates.minResidency] || 1;
      if (passRank(user.residency) < needRank) { killed.F3++; return; }
      if (gates.licenceMonths != null && gates.licenceMonths > cap) { killed.F3++; return; }
      // F1: settled pay never clears the minimum viable floor
      if (role.settled_pay < user.min_viable) { killed.F1++; return; }
      // F2: reskilling time exceeds the selected timeline
      if (role.reskill_months > cap) { killed.F2++; return; }
      // F1b: months below floor exceed runway -> quarantine
      if (a.monthsBelow.count > user.runway) {
        quarantined.push({ role: role, analysis: a, reason: 'F1b' }); return;
      }
      // F4: housing loan + variable/self-employed/probation-heavy -> quarantine with TDSR note
      if (user.housingLoan && (role.incomeStability === 'variable' ||
          role.incomeStability === 'self-employed' || role.incomeStability === 'probation-heavy')) {
        quarantined.push({ role: role, analysis: a, reason: 'F4' }); return;
      }
      ranked.push({ role: role, analysis: a });
    });
    return { ranked: ranked, quarantined: quarantined, killed: killed };
  }

  function passRank(residency) { return RES_RANK[residency] || 1; }

  // Step 2 — Ranking. Money primary: sort toggle on 36-mo (survival, default)
  // vs 120-mo (career) deltas; secondary breaks exact ties only.
  // Other primaries: primary rubric; 36-mo dollars break exact ties only.
  function rankRoles(ranked, user) {
    var primary = user.primary;
    ranked.sort(function (x, y) {
      if (primary === 'money') {
        var useCareer = user.sortMode === 'career' && x.analysis.delta120 != null && y.analysis.delta120 != null;
        var dx = useCareer ? x.analysis.delta120 : x.analysis.delta36;
        var dy = useCareer ? y.analysis.delta120 : y.analysis.delta36;
        if (dx !== dy) return dy - dx;
        return rubricScore(y.role, user.secondary) - rubricScore(x.role, user.secondary);
      }
      var sx = rubricScore(x.role, primary), sy = rubricScore(y.role, primary);
      if (sx !== sy) return sy - sx;
      return y.analysis.delta36 - x.analysis.delta36;
    });
    return ranked;
  }

  // Step 3 — Alignment verdict.
  function alignmentVerdict(user, ranked) {
    var beatsStay = ranked.filter(function (r) { return r.analysis.delta36 > 0; });
    if (user.primary === 'money') {
      if (user.alignment === 'yes') {
        if (beatsStay.length === 0) {
          return { key: 'stay', tone: 'stay' };
        }
        return { key: 'serves-but-money', tone: 'push', roles: beatsStay };
      }
      return { key: 'mismatch', tone: 'push' };
    }
    // Other primaries: trigger keys off the Q4 answer alone.
    if (user.alignment === 'yes') return { key: 'serves', tone: 'calm' };
    return { key: 'mismatch', tone: 'push' };
  }

  // Pushback patterns. Each fires only on collision between two user-entered inputs.
  function pushbacks(user, ranked, quarantined, killed, roles) {
    var out = [];
    var cur = user.current_pay, floor = user.min_viable;
    var fmt = money;

    function meaningViable(pool) {
      return pool.filter(function (r) { return rubricScore(r.role || r, 'meaning') >= 60; });
    }
    // Candidates that passed F3 and F2 (before the money filters), for P1/P5.
    var preMoney = roles.filter(function (role) {
      var gates = role.gates || {};
      if (passRank(user.residency) < (RES_RANK[gates.minResidency] || 1)) return false;
      if (gates.licenceMonths != null && gates.licenceMonths > TIMELINE_CAPS[user.timeline]) return false;
      return role.reskill_months <= TIMELINE_CAPS[user.timeline];
    });

    // P1: meaning primary + floor closes entry on every meaning-viable role.
    if (user.primary === 'meaning') {
      var mv = meaningViable(preMoney);
      if (mv.length > 0) {
        var closed = mv.filter(function (role) { return role.settled_pay < floor; }).length;
        if (closed === mv.length) {
          out.push({ id: 'P1', copy: 'Your ' + fmt(floor) + ' floor closes the entry door on ' + closed +
            ' of ' + mv.length + ' meaning-first paths. Which moves: the floor, the timeline, or the shortlist?' });
        }
      }
    }

    // P2: money primary, from Q4 + cash. No quartiles.
    if (user.primary === 'money' && user.alignment === 'yes' && ranked.length > 0) {
      var winners = ranked.filter(function (r) { return r.analysis.delta36 > 0; });
      if (winners.length > 0) {
        out.push({ id: 'P2', copy: 'Your role serves your objective, but the money says otherwise. ' +
          winners[0].role.title + ' beats staying by ' + fmt(winners[0].analysis.delta36) +
          ' over 36 months. Which do you trust?' });
      }
    }

    // P3: timeline cap vs reskilling time. Name the next bucket that revives roles.
    if (ranked.length === 0 && killed.F2 > 0) {
      var idx = TIMELINE_KEYS.indexOf(user.timeline);
      if (idx >= 0 && idx < TIMELINE_KEYS.length - 1) {
        var nextKey = TIMELINE_KEYS[idx + 1], nextCap = TIMELINE_CAPS[nextKey];
        var revive = roles.filter(function (role) {
          return role.reskill_months > TIMELINE_CAPS[user.timeline] && role.reskill_months <= nextCap;
        }).length;
        if (revive > 0) {
          out.push({ id: 'P3', copy: 'On your timeline there is no switch that clears your floor. At ' +
            TIMELINE_LABELS[nextKey] + ', ' + revive + ' role' + (revive === 1 ? '' : 's') + ' revive' + '.' });
        }
      }
    }

    // P4: Q4 partly/no -> mismatch sentence quoting their answer.
    if (user.alignment === 'partly' || user.alignment === 'no') {
      var ans = user.alignment === 'partly' ? 'partly' : 'does not';
      out.push({ id: 'P4', copy: 'You said your current role ' + ans + ' serve' +
        (user.alignment === 'no' ? 's' : '') + ' your ' + DIM_LABELS[user.primary] +
        ' objective. The numbers below are conditional on that answer.' });
    }

    // P5: meaning primary + thin headroom + every surviving meaning-viable role dips further at entry.
    if (user.primary === 'meaning' && cur > 0 && (cur - floor) / cur < 0.25) {
      var survivors = ranked.concat(quarantined).map(function (r) { return r.role; });
      var mvS = meaningViable(survivors);
      if (mvS.length > 0 && mvS.every(function (role) { return role.entry_pay < floor; })) {
        out.push({ id: 'P5', copy: 'Your floor sits less than 25% below today\'s pay, and every surviving meaning-first path starts below it. ' +
          'The dip is real: ' + mvS.map(function (role) { return role.title + ' starts at ' + fmt(role.entry_pay); }).join('; ') + '.' });
      }
    }

    // P6: fires whenever months-below-floor > 0 on a shown role.
    var anyBelow = ranked.concat(quarantined).filter(function (r) { return r.analysis.monthsBelow.count > 0; });
    if (anyBelow.length > 0) {
      var worst = anyBelow.slice().sort(function (a, b) { return b.analysis.monthsBelow.count - a.analysis.monthsBelow.count; })[0];
      var mb = worst.analysis.monthsBelow;
      var hh = user.floorQualifier === 'household' ? ' (you flagged this floor as the household\'s)' : '';
      out.push({ id: 'P6', copy: 'On ' + worst.role.title + ' you\'d spend ' + mb.count +
        ' months below your own minimum' + hh + ' — ' + mb.unpaid + ' unpaid + ' + mb.employed +
        ' employed. Savings to bridge it, or should the floor or runway move?' });
    }

    // P7 is per-role, attached on the card.
    return out;
  }

  function p7(role, user, primary) {
    if (role.settled_pay < user.current_pay) {
      return 'This path never gets you back to today\'s pay (' + money(role.settled_pay) + ' settled vs ' +
        money(user.current_pay) + ' now).' + (primary === 'money' ? ' Money is your primary objective, so it\'s out.' : ' Go in with eyes open.');
    }
    return null;
  }

  function money(n) {
    var neg = n < 0;
    var v = Math.abs(Math.round(n));
    return (neg ? '−S$' : 'S$') + v.toLocaleString('en-SG');
  }

  function analyze(user, roles) {
    var analyses = {};
    roles.forEach(function (role) { analyses[role.id] = cashAnalysis(role, user); });
    var f = filterRoles(roles, user, analyses);
    var ranked = rankRoles(f.ranked, user);
    return {
      analyses: analyses,
      ranked: ranked,
      quarantined: f.quarantined,
      killed: f.killed,
      verdict: alignmentVerdict(user, ranked),
      pushbacks: pushbacks(user, ranked, f.quarantined, f.killed, roles),
      p7: function (role) { return p7(role, user, user.primary); }
    };
  }

  return {
    TIMELINE_CAPS: TIMELINE_CAPS,
    TIMELINE_LABELS: TIMELINE_LABELS,
    DIM_LABELS: DIM_LABELS,
    eeRate: eeRate,
    grossToCash: grossToCash,
    reskillNett: reskillNett,
    switchPay: switchPay,
    cashAnalysis: cashAnalysis,
    rubricScore: rubricScore,
    filterRoles: filterRoles,
    rankRoles: rankRoles,
    alignmentVerdict: alignmentVerdict,
    pushbacks: pushbacks,
    p7: p7,
    money: money,
    analyze: analyze
  };
});
