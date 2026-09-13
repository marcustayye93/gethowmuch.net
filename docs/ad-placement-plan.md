# GetHowMuch Ad Placement Plan (2026-09-13)

Slot maps: `ad-slots-mobile.png`, `ad-slots-desktop.png` (same folder).

## Decision: two slots, identical on mobile and desktop

Restraint is the design. Two in-content slots, both below the interactive
calculator, both wrapped in the site's own card chrome (2px ink border, hard
offset shadow) with a small tracked "ADVERTISEMENT" label. No layout change
needed on either breakpoint.

### A1 — below the result panel ("the answer moment")

- Position: directly under the result panel, above the tips/savers section.
- Why: the user just got their number. Highest intent, highest attention,
  and the result panel is read-only so there is zero accidental-click risk.
- Mobile: 300x250 / 336x280 responsive. Desktop: 728x90 leaderboard.
- This is the money slot. If we ever run only one ad, it is this one.

### A2 — end of content

- Position: after the FAQ, before the footer.
- Why: captures the scrollers who read everything. Zero UX cost.
- Both breakpoints: multiplex / matched-content style unit.

### Affiliate native slot (separate, not AdSense)

- Lives inside the tips/savers section as a bordered "partner" card with
  disclosure, per the staged affiliate CTA plan. Never competes with A1/A2;
  it is content-styled, not an ad unit.

## Deliberately excluded

- Above the fold / above the calculator: pushes the tool down, punishes the
  core experience, invites accidental clicks near the nav.
- Between input controls: a thumb slip on a slider becoming an ad click is
  the fastest way to an AdSense policy flag.
- Inside the FAQ accordion: breaks reading flow, looks desperate.
- Sticky/floating mobile units: hardcoded ones are a policy and UX minefield.
  (AdSense Auto Ads anchor is acceptable later if we want it; not hardcoded.)

## Phase 2 (deferred, needs layout change)

- Desktop sticky right rail 300x600. Requires widening the page grid beyond
  the 720px centered column. Only worth it when A1 revenue justifies the
  redesign. Not now.

## Implementation rules

1. Reserve min-height per slot (250px mobile A1, 90px desktop A1) so loading
   ads never shift content (no CLS).
2. If an ad fails to fill, collapse the wrapper entirely. Never show an
   empty bordered box.
3. Slots stay hidden until AdSense approval lands. Ship the markup behind
   the approval flag, not before.
4. Homepage (retirement) is the flagship: start it on A1+A2 like the rest,
   but it is the first page we pull back from if any metric dips.
5. No ad within 48px of a slider or input. Ever.
