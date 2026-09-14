/* GetHowMuch shared take-home module.
 *
 * Single source of truth for the CPF + income-tax branching used by calculators.
 * Two switches, never collapsed:
 *   residency  ("sg" | "pr" | "wp")            drives CPF only
 *   taxStatus  ("resident" | "nonresident")     drives the tax branch
 *
 * Works as a browser global (script tag) and as a node module so the frozen
 * fixture harness can require it.
 *
 * Known limitations (documented, not modeled):
 * - CPF graduated rates at or below S$750 monthly wages
 * - PR first-two-year CPF graduation (modeled at full rates)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.GHMTakeHome = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* CPF contribution rates, private sector, from 1 Jan 2026 (CPF Board).
     Mirrors the CPF_POLICY contributionBands on /cpf/. */
  var CPF_BANDS = [
    { maxAge: 55, employer: 0.17,  employee: 0.20  },
    { maxAge: 60, employer: 0.16,  employee: 0.18  },
    { maxAge: 65, employer: 0.125, employee: 0.125 },
    { maxAge: 70, employer: 0.09,  employee: 0.075 },
    { maxAge: Infinity, employer: 0.075, employee: 0.05 }
  ];
  var CPF_WAGE_CEILING = 8000;

  function cpfBand(age) {
    for (var i = 0; i < CPF_BANDS.length; i++) {
      if (age <= CPF_BANDS[i].maxAge) return CPF_BANDS[i];
    }
    return CPF_BANDS[CPF_BANDS.length - 1];
  }

  /* Earned income relief (IRAS): below 55: S$1,000; 55-59: S$6,000; 60+: S$8,000. */
  function eirFor(age) {
    return age < 55 ? 1000 : age < 60 ? 6000 : 8000;
  }

  /* Resident progressive bands, YA2024 onwards: [band width, rate].
     Mirrors the taxBands on /income-tax/. */
  var TAX_BANDS = [
    [20000, 0], [10000, 0.02], [10000, 0.035], [40000, 0.07],
    [40000, 0.115], [40000, 0.15], [40000, 0.18], [40000, 0.19],
    [40000, 0.195], [40000, 0.20], [180000, 0.22], [500000, 0.23],
    [Infinity, 0.24]
  ];

  function progressiveTax(chargeable) {
    var rem = chargeable, tax = 0;
    for (var i = 0; i < TAX_BANDS.length; i++) {
      if (rem <= 0) break;
      var t = Math.min(rem, TAX_BANDS[i][0]);
      tax += t * TAX_BANDS[i][1];
      rem -= t;
    }
    return tax;
  }

  /* takeHome({gross, age, residency, taxStatus})
   * gross:     monthly gross salary in S$
   * age:       integer years
   * residency: "sg" | "pr" | "wp"  (work pass => no CPF, both shares)
   * taxStatus: "resident" | "nonresident"
   * returns { cpfEmployee, cpfEmployer, taxMonth, takeHome } — monthly S$.
   *
   * Resident branch: bands on (12*G - CPF relief - EIR).
   * Non-resident branch (IRAS): flat 15% of gross or resident bands on gross,
   * whichever is higher; no reliefs. */
  function takeHome(o) {
    var G = Math.max(0, +o.gross || 0);
    var age = Math.max(16, Math.min(99, Math.round(+o.age || 40)));
    var band = cpfBand(age);
    var isWp = o.residency === "wp";
    var cpfWage = Math.min(G, CPF_WAGE_CEILING);
    var cpfEmployee = isWp ? 0 : cpfWage * band.employee;
    var cpfEmployer = isWp ? 0 : cpfWage * band.employer;
    var taxYear;
    if (o.taxStatus === "nonresident") {
      taxYear = Math.max(0.15 * 12 * G, progressiveTax(12 * G));
    } else {
      var chargeable = Math.max(0, 12 * G - 12 * cpfEmployee - eirFor(age));
      taxYear = progressiveTax(chargeable);
    }
    var taxMonth = taxYear / 12;
    return {
      cpfEmployee: cpfEmployee,
      cpfEmployer: cpfEmployer,
      taxMonth: taxMonth,
      takeHome: G - cpfEmployee - taxMonth
    };
  }

  return {
    CPF_BANDS: CPF_BANDS,
    CPF_WAGE_CEILING: CPF_WAGE_CEILING,
    eirFor: eirFor,
    progressiveTax: progressiveTax,
    takeHome: takeHome
  };
});
