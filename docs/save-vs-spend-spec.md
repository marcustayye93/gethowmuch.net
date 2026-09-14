# Spec: Save vs Spend calculator (`/save-vs-spend/`)

## Concept

One question in, two numbers out: **how much to save each month** and **how much
you can spend guilt-free while you build your safety net**.

The editorial spine is the 20%-rule critique: flat percentages pretend essentials
scale with income, and they don't. This page derives the savings target from the
user's real essentials instead of their gross salary, so the pain is equalized
across incomes.

Killer comparison for the page copy: the 20%-of-gross rule asks a S$3,000 earner for S$600/mo.
Their actual discretionary income is about S$587. The rule demands more than they
have. It is broken.

Scope boundary (this answers the "guilt-free" objection): this page is **step 1,
the safety net**. It does not bless lifetime spending. The monthly saving is framed
as a persistent habit: first it fills the emergency fund, then it flows to
investments. Phase 2 is a real handoff to the retirement calculator, never a
made-up investing rate.

## The formula

```
Inputs
  G      = monthly gross salary (S$)
  E      = monthly essentials (S$)
  cash   = emergency cash already saved (S$)
  M      = emergency cover, 3 or 6 months (default 6)
  T      = build timeline, 6-24 months slider (default 12)
  age    = your age (default 40, same as /income-tax/)

Step 1 — take-home. Residency drives CPF; tax status drives the tax branch.
  Two switches, never collapsed.
  CPF:
    Singaporean / PR: cpf_employee = CPF_EMPLOYEE(G, age)
                      cpf_employer = CPF_EMPLOYER(G, age)
    Work pass:        cpf_employee = 0, cpf_employer = 0
  Tax:
    Tax resident:     tax_month = INCOME_TAX(G, age, cpf_employee) / 12
                      # same engine as /income-tax/: resident bands, EIR included,
                      # CPF relief only when cpf_employee > 0
    Non-resident:     tax_year  = max(0.15 * 12 * G, PROGRESSIVE_BANDS(12 * G))
                      tax_month = tax_year / 12
                      # IRAS rule: flat 15% or resident bands on gross,
                      # whichever higher; no reliefs
  take_home = G - cpf_employee - tax_month
  Note: wages at or below S$750 use CPF Board graduated rates, not modeled here;
  the page applies the standard rate table throughout. Stated as a limitation.

Step 2 — the pool
  discretion = take_home - E

Step 3 — the split
  target     = max(E * M - cash, 0)                 # what is left to build
  planned    = target / T                           # monthly saving on schedule
  actual     = min(planned, 0.8 * max(discretion, 0))# keep 20% of discretionary for yourself
  guilt_free = max(discretion - actual, 0)
  months     = target / actual                      # if actual > 0; else "—"
  cash_rate  = actual / take_home                    # headline rate, vs the 20% rule

Outputs
  hero       = (actual, guilt_free)   # "Save S$X/mo. S$Y/mo is guilt-free while you build."
  fund_state = target                # 0 → fund-full state (see below)
  cpf_line   = cpf_employee + cpf_employer  # supporting line only, never in the rate
```

When the monthly number is pace-bound (not 80%-capped), the hero caption adds one
line: "The S$X/mo savings number is the N-month pace for your fund. Earning more
grows the guilt-free pool instead." This answers the "stuck slider" confusion: the
number is fixed by the fund math, extra income flows to guilt-free.

Back/forward navigation: a `pageshow` listener re-syncs every slider's state, label
and fill from the DOM, because browsers can restore slider positions after the
page script ran (thumbs would otherwise detach from their fill track).

Why the 80% cap: when the timeline is aggressive relative to means, saving 100% of
discretionary prints S$0 guilt-free and breaks the page's promise for exactly the
audience the 20% critique serves. Capping at 80% stretches the timeline instead.
A plan that leaves zero fun money for 19 months is a plan nobody follows.
The 80% is a product judgment, not a derived quantity, and the page says so openly:
the breakdown strip carries the line "we cap saving at 80% of what's left, so there
is always something for you." It is a ceiling that only binds in the aggressive case,
never a prescribed rate.

Why the rate is cash-only: employer CPF never hits your bank account and is not part
of your gross. Folding it into the headline is how someone cash-saving 22% walks away
claiming "I already save 59%." The 20% rule is a take-home rule, so the honest
comparison is saving ÷ take-home. CPF appears as its own line: "plus S$X/mo forced
into CPF."

## Worked examples (recomputed from the YA2024 bands, age 40)

**A: G=5,000, E=2,200, cash=0, M=6, T=12**
Chargeable = 60,000 - 12,000 (CPF) - 1,000 (EIR) = 47,000.
Tax = 200 + 350 + 490 = S$1,040/yr = S$86.67/mo.
Take-home S$3,913.33. Discretionary S$1,713.33.
Target S$13,200 → planned S$1,100 (under the 80% cap of S$1,371).
**Save S$1,100/mo. S$613/mo guilt-free while you build.** Cash rate 28.1%.
Plus S$1,850/mo forced into CPF (separate line).

**B: G=3,000, E=1,800, cash=0, M=6, T=12**
Chargeable = 36,000 - 7,200 (CPF) - 1,000 (EIR) = 27,800.
Tax = 7,800 x 2% = S$156/yr = S$13.00/mo.
Take-home S$2,387. Discretionary S$587.
Target S$10,800 → planned S$900 exceeds the 80% cap (S$470).
**Save S$470/mo. S$117/mo guilt-free while you build.** Fund fills in ~23 months.
Cash rate 19.7%. The 20%-of-gross rule asked this earner for S$600 they do not have.

**C: same as A but Work pass + Tax resident, G=5,000, E=2,200, cash=0, M=6, T=12**
The common work-pass case: no CPF, resident tax with EIR. Chargeable = 60,000 - 1,000
= S$59,000 → tax S$1,880/yr = S$156.67/mo. Take-home S$4,843. Discretionary S$2,643.
Target S$13,200 → planned S$1,100 (under the 80% cap of S$2,114).
**Save S$1,100/mo. S$1,543/mo guilt-free while you build.** Cash rate 22.7%.

**D: same but Work pass + Non-resident (short stay)**
No CPF, no reliefs. Tax = max(15% x 60,000, bands(60,000)) = max(9,000, 1,950)
= S$9,000/yr = S$750/mo. Take-home S$4,250. Discretionary S$2,050.
**Save S$1,100/mo. S$950/mo guilt-free while you build.** Cash rate 25.9%.
The collapsed v2 spec showed only D and called it the work-pass case; the S$593/mo
tax overstatement is why the toggle is split.

## Edge cases

- `discretion ≤ 0`: essentials exceed take-home. Say it plainly:
  "Your essentials (S$X) are S$Y above your take-home (S$Z)." No guilt-free number.
- `target = 0` (fund already full): fund-full state, specified once here. Hero becomes
  "Your safety net is covered." No saving number is printed for phase 2, because the
  emergency build rate was never an investing rate. Body hands off to the retirement
  calculator to size the investing amount, with the link.
- `planned > 0.8 × discretion`: cap binds, timeline recomputes, shown as
  "about N months instead of T."
- `G = 0`: all outputs S$0, prompt for salary.

## Inputs (UI)

Every slider's figure is also a number field: tapping the value lets the user
type an exact number (numeric keyboard on mobile, select-all on focus, same as
the income-tax calculator). Typing updates the slider and the result live;
leaving the field clamps to the slider's range and snaps to its step, then
shows the committed value. Clearing the field and leaving it restores the
current value.

1. Monthly gross salary — slider, S$0-30,000 step S$100, default S$4,700.
   Helper line under the label: "The top number on your payslip, before CPF and
   tax come out. Not what lands in your bank account." Default is the median:
   MOM 2024 median S$5,500 for full-time employed residents incl. employer CPF,
   adjusted to payslip basis (÷ 1.17). A live hint under the slider reads
   "Median full-time salary is S$4,700 (MOM 2024). You're S$X above/below it."
   (or "You're right at the middle.").
2. Monthly essentials — slider, S$0-15,000 step S$1, default S$2,667 (HES categories with housing at a renter's S$900, Marcus's call).
   Label: "Monthly essentials, or break it down by category right below it".
   Helper line: "Rent, food, transport, bills, insurance, parents' allowance,
   loan repayments. Not dining out or shopping, that comes out of the guilt-free pool."
   Card subline: "Essentials are what you must spend to live. Salary starts at
   the median of Singapore's workforce, because averages get dragged up by
   high earners." A live hint reads "Housing follows a renter's S$900; the
   rest is HES 2023 (S$2,667 total)." with the above/below line. (or "right at
   the middle.").
   Optional "Break it down by category" toggle (full-width button, ink border +
   hard shadow) reveals 6 sub-sliders (Housing 900 / Food 486 / Transport 300 /
   Bills & utilities 90 / Insurance 198 / Everything else 693, summing to the
   S$2,667 default; sub-sliders use step S$1 so the exact figures are valid).
   Sub-sliders sum to the main value; dragging the main slider
   re-scales the parts proportionally (snapped to S$50). Each sub-slider's max is capped live so
   the parts can never exceed S$15,000.
   Inside the breakdown, a dashed "Start from the typical Singaporean" button
   fills the six sliders from SingStat HES 2023 per-member cells (cash spending
   only, imputed rent excluded) EXCEPT housing: Housing 900 is Marcus's call
   (2026-09-14), a renter's room, because the survey's S$219 mixes in homeowners
   who pay almost no cash rent and reads as broken to anyone renting. S$900 is
   Marcus's figure, not a published stat. / Food 486 (groceries + eating
   out) / Transport 300 / Bills 90 (info & comms household S$270 / 2.99;
   utilities already sit inside Housing, so the label no longer says "SP") /
   Insurance 198 (insurance & financial services household S$590 / 2.99; no
   official per-member cell published, treat as unverified at the last dollar) /
   Everything else 693 (residual so parts sum to S$2,667). The old S$219 figure
   (utilities + dwelling repairs + actual rent, per member) is recorded here for
   provenance. Implied household size 5931/1986 = 2.99. Derivation
   corrected 2026-09-14: the previous defaults (185/475/320/200/716) divided
   household figures by 2.99, which is wrong for housing; SingStat's own
   per-member column is now used where published.
   Note under the button: "Based on SingStat's 2023 Household Expenditure
   Survey, per person. SingStat publishes averages, not medians, for spending."
   (Medians can't be split by category, so the spending benchmark is the
   typical Singaporean, not a true median. Stated openly in the formula section.)
3. Emergency cash already saved — slider + number, S$0-100,000, default S$0.
   Cash starts at S$0 because no credible median for cash savings is published;
   we don't invent one. Static hint: "7 in 10 Singaporeans keep 3-6 months of
   expenses saved (MoneySense 2023)."
4. Your age — slider + number, 16-99, default 40 (drives CPF rates and EIR).
5. Residency — segmented toggle: Singaporean / PR / Employment-work pass (button reads "Employment/work pass"), default Singaporean.
   Drives CPF only. PRs are modeled at full CPF rates (first-two-year graduation
   not modeled, noted as a limitation).
6. Tax status — Tax resident / Non-resident segmented toggle, default Tax resident,
   with the helper "Tax resident if you were in Singapore 183 days last year.
   Most work-pass holders are." Drives the tax branch. Always visible; the
   non-resident formula is correct for citizens too.
7. Emergency cover — 3 / 6 month segmented toggle, default 6.
8. Build timeline — slider 6-24 months, default 12.

All results render on load and update live. No button. Number inputs select-all on focus.
Sliders inset ≥20px, thumbs ≥28px.

Above the first card sits a jump link: "If you're curious about how we calculate
this, click here", anchor-scrolling to the fleshed-out formula section
(#formula) at the bottom. The formula section shows the six-line arithmetic in a
mono block plus flex copy: exact-age CPF against the 1 Jan 2026 table (S$8,000
ceiling, over-55 taper, work-pass zero), both tax branches (resident progressive
+ exact-age EIR; non-resident max(15% flat, resident bands)), the 80% cap stated
as an open product judgment, cash/CPF separation, and disclosed limits.

## Outputs (UI)

- Hero: "Save **S$X/mo**. **S$Y/mo** is guilt-free while you build." (Space Mono, large)
- Cash savings rate: P% of take-home, with the 20%-of-gross rule as the reference line.
- Forced CPF line: "plus S$Z/mo already going into CPF."
- Emergency fund target, monthly saving, recomputed timeline.
- Breakdown strip: take-home → essentials → discretionary → save / spend.
- Phase 2 block: "When the fund is full, keep the habit going. Your retirement
  calculator sizes the investing amount." Link to retirement calculator. Never names
  the build rate as the continuing amount.
- Retirement handoff: the phase-2 CTA links to /?age=<age>&income=<essentials>
  (income omitted when essentials is 0), rebuilt live on every render. The
  retirement page prefills its age and "how much do you want every month" fields
  from those params when present (matching a preset scenario when the income
  equals one, e.g. S$3,000), and is otherwise completely untouched.

## Design (brand lock)

- Angular template (income-tax / car-coe / mortgage style): sharp corners, 2px ink
  borders, hard offset shadows, paper background.
- One primary accent: proposed **coral `#e8553f`** (Marcus can veto).
- Space Grotesk UI, Space Mono figures. No em dashes. Mobile-first, brevity rules.

## Copy notes

- H1: "How much to save, how much to spend?" (leads with saving; the guilt-free
  hook lives in the hero line and subline, not the title)
- Subline: "The 20% rule doesn't apply for everyone. Let's start from what you
  actually save and spend."
- The S$3,000 example is the page's proof point.

## FAQ (5, with FAQPage schema)

1. Why not just save 20%? — flat % ignores that essentials don't scale; the S$3k
   earner example (20% of gross = S$600, but only S$587 discretionary exists).
2. Does CPF count as savings? — for citizens and PRs 55 and under earning above
   S$750, it is 20% from you and 17% from your employer. Illiquid but yours and
   growing. The calculator above uses your exact age and residency, so your number
   is yours. This page plans cash savings on top, and keeps the two numbers
   separate on purpose.
3. What counts as essentials? — rent, food, transport, bills, insurance, parents'
   allowance, loan repayments.
4. What happens when my emergency fund is full? — the habit continues, but the amount
   gets re-sized. Your emergency build rate was never an investing rate, so size the
   investing amount with the retirement calculator.
5. 3 or 6 months — which is right for me? — 3 if stable job + safety net; 6 if
   freelance, single-income household, or no family backup.

## Build gate (frozen fixtures)

The take-home function ships as a shared module, not page-inline logic. It must
pass all four fixtures before the page ships; the harness lives with the other
audit harnesses and re-runs on every batch touching the module:

1. Citizen, tax resident, age 40, G=5,000 → tax/mo 86.67, take-home 3,913.33
2. Citizen, tax resident, age 40, G=3,000 → tax/mo 13.00, take-home 2,387.00
3. Work pass, tax resident, age 40, G=5,000 → tax/mo 156.67, take-home 4,843.33
4. Work pass, non-resident, age 40, G=5,000 → tax/mo 750.00, take-home 4,250.00

No page ships while a fixture fails. The module is the only place CPF/tax
branching lives; the page itself is arithmetic and copy.

## Ship checklist

- [x] `/save-vs-spend/` page + nav entry (after Retirement, all 10 existing pages + hub card)
- [x] Sitemap + meta/OG tags + FAQPage schema
- [x] Footer disclaimer (standard "estimates for planning only" line)
- [x] Pixel ViewContent markers (ghm_ad_31-35 reserved; catalog items as follow-up)
- [ ] AdSense A1/A2 slots per placement plan (after approval-day pattern)
- [x] Cloudflare beacon with the CORRECT token (de45d534b5534b8c98fff31a31425b3a); stale-token swap on other pages is a separate approved batch
- [x] Shared take-home module `js/takehome.js` + frozen fixtures (4/4 pass) + page-logic harness (A-D + edges pass)
- [x] The module is INLINED verbatim into save-vs-spend/index.html (no `<script src>`)
  so the page works opened straight from the file (file:// or single-file preview),
  where the absolute `/js` path does not resolve and a missing module kills every
  button on the page. `js/takehome.js` stays the canonical source; the page audit
  fails if the inlined copy drifts.

Build status 2026-09-14: built locally, NOT pushed. Awaiting Marcus's review of this exact batch before any push or deploy.

## Review history

- 2026-09-14: external review scored the v1 spec 4/10. Findings adopted in this
  revision: worked examples recomputed from the real bands (EIR was missing),
  cash-only headline rate (employer CPF out of the numerator), existing-cash input,
  exact-age CPF/tax via the shared engine, 80% discretionary cap, scoped
  safety-net framing with a retirement handoff. One reviewer correction rejected:
  the "S$39/mo" tax figure for Example B does not reproduce from the YA2024 bands;
  the correct figure is ~S$13/mo.
- 2026-09-14: second review scored the revision 6.5/10. Adopted: residency toggle
  (Singaporean / PR / Work pass) with a specified non-resident branch (no CPF, no
  reliefs, IRAS 15%-or-progressive-whichever-higher rule); fund-full specified once
  (no build rate reused as investing rate); H1 rebalanced to lead with saving;
  FAQ 2 de-frozen from "37%"; 80% cap disclosed openly in UI copy as a product
  judgment. Documented as limitations, not modeled: CPF graduated rates at or
  below S$750 wages, PR first-two-year CPF graduation.
- 2026-09-14: third review scored v3 7/10. Fixed the legal-status collapse: the
  single work-pass branch had applied non-resident tax to everyone. Split into
  residency (drives CPF only) + tax status (tax resident / non-resident, default
  tax resident, with 183-day helper). The common work-pass case is now Example C:
  no CPF, resident tax with EIR (tax S$156.67/mo, take-home S$4,843, guilt-free
  S$1,543, cash rate 22.7%). The short-stay non-resident branch is Example D.
  Also qualified every S$600 reference as 20%-of-gross so screenshots cannot mix
  it with the take-home headline rate.
- 2026-09-14: fourth review scored v4 8/10. Model declared done, identity frozen.
  Adopted: the take-home function ships as a shared module with four frozen
  fixtures (above), CI-gated; no third switch for the rare citizen+non-resident
  case.

## Open decisions for Marcus

1. Accent color: coral `#e8553f` ok, or pick another?
2. Nav position: after Retirement, or at the end?
3. Defaults: salary S$4,700 (median) / essentials S$2,667 (HES categories, renter housing) / cash saved S$0 / age 40 /
   cover 6 mo / timeline 12 mo?
4. URL: `/save-vs-spend/` ok?
- 2026-09-14 (evening): growth projection section added per Marcus. The covered
  state no longer just says "Covered": the hero shows the monthly investable
  amount (e.g. "S$6,220 /mo to invest") with the caption pointing at the chart
  below. A "Your money at work" section projects the monthly amount (covered:
  discretionary; building: actual monthly save) forward with monthly
  contributions: FV = PMT x (((1+r/12)^(12T) - 1) / (r/12)). Three editable-rate
  dotted lines: Bank savings 0.5%, S-REITs 6.0%, S&P 500 7.0% (same equities
  assumption as the retirement page). Year slider 1-30, default 10. Illustrative
  disclaimer, not financial advice. Emergency cash ceiling raised 100,000 ->
  5,000,000 (slider + number field + S$5M label).
