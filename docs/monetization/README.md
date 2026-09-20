# Monetization chain, admin analytics & fare truth

Implementation of the 2026-09-20 spec. Branch `monetization-chain-20260920`.
324 tests (the full suite). **Not deployed** — web deploys stay gated.

> **Rebased onto `main`.** This is one commit of 45 files sitting directly on
> `main`, so the diff is only this work. Eight files conflicted; two resolutions
> were judgement calls worth knowing about:
>
> - **`src/lib/poller.ts` was rebuilt on `main`'s version, not mine.** `main` had
>   fixed two things my branch predated: the nearby-date test now compares actual
>   dates rather than trusting the feed source, and the `!isNearby` guard was
>   deliberately removed from the threshold branch because it had *silenced four
>   of five live routes*. Taking my side would have reverted both. `main`'s
>   semantics are intact; the verification, allocator and alert-taxonomy changes
>   were re-applied on top.
> - **`src/lib/email.ts` kept `main`'s mistake-fare accent** (`#8a6b1e`), which
>   `main` darkened to clear AA on white. My side still carried the old
>   `#b8860b`. The verified-age line was layered on rather than replacing it.
>
> The agents' `BASE` also kept `main`'s post-cutover `https://flycheap.live`
> rather than my `APP_URL`; my change existed only to escape the stale
> `flycheap.18dn.com`, which `main` had already fixed.
>
> Full suite on the rebased tree: **324 tests, 31 files, all passing.**

---

## What the spec asked for first, and what was actually wrong

> If you cannot produce those three numbers today, that is the first build item,
> ahead of every feature in this document.

All three were uncomputable, and the reason was recording, not analysis:

| Number | Why it was impossible |
|---|---|
| Provider API cost per tracked route | `api_calls` wrote one aggregate row per poll with **no provider** and no cost column |
| Commission per converted alert, by type | `affiliate_clicks` had **no `alert_id`** — the alert→click join did not exist |
| Alert → click → book conversion, by type | Same missing join, **plus** `alerts_sent.kind` was effectively always `'threshold'` |

That last one was a live bug. The price-drop branch called `insertAlert()` with no
kind, and the alert email classified mistake fares at render time by its own rule.
So the database said `threshold` while the email said "MISTAKE FARE", and the
spec's central claim — that mistake-fare alerts convert several times better, and
should therefore get the poll budget — could not be checked at all.

---

## Files

| Area | Files |
|---|---|
| Attribution | `src/lib/partnerLink.ts`, `src/lib/affiliate.ts`, `src/app/go/route.ts` |
| Alert taxonomy | `src/lib/alertKind.ts` |
| Fare truth | `src/lib/fareTruth.ts`, `src/lib/fareAge.ts`, `src/lib/verdictScoring.ts` |
| Poll economics | `src/lib/providerCost.ts`, `src/lib/pollBudget.ts` |
| Trip chain | `src/lib/tripChain.ts`, `src/lib/tripChainEmail.ts`, `src/app/trip/**` |
| Analytics | `src/lib/analytics.ts`, `src/app/admin/{trust,economics,funnel}/page.tsx` |
| Alarms | `src/lib/ops/monetizationProbes.ts` |

---

## Decisions that differ from the spec, and why

**`buildPartnerLink` returns a `/go` URL, not a partner URL.** The spec asks for
one function returning the final URL. This codebase cannot do that safely: link
builders run in client-bundled code where `process.env.AVIASALES_MARKER` is
`undefined`, so a client-built partner URL ships without its marker — the exact
bug that has already cost attribution here once. `/go` stays the only place a
partner hostname receives affiliate parameters; the builder is the only place a
`/go` link is constructed. The CI guard in `tests/partner-links.test.ts` enforces
both halves, with an allowlist that documents why each remaining file is
legitimate and that fails on stale entries.

**The allocator is gated at `tier-capped`, not `full`.** The pricing page sells
Pro as "30-minute polling — 8× faster than Free". At full authority the
allocator's cool band is four hours, so a paying customer's low-priority routes
would poll eight times *slower* than what they bought. The spec's answer is to
move the paid tiers onto route count and features — that is a pricing decision,
not an implementation detail.

`poll_allocator_mode`:
- `shadow` — score and band, change nothing
- `tier-capped` — **default**; may poll faster than the tier, never slower
- `full` — the spec's behaviour

`projectedSavings()` reports what `full` would save, so the pricing call can be
made against a measured number. Flip it once the pricing page no longer sells a
polling interval.

**The confirmation answer is a POST.** Corporate mail security (Proofpoint,
Defender, Mimecast) fetches every link in a message before the recipient sees it.
A GET that mutated would mark trips booked for people who never opened the email
and then fire hotel and insurance offers at them — rule 1 defeated through the
back door.

---

## Two bugs this work introduced and then fixed

Recorded because both were invisible in testing and would have been invisible in
production.

**Reserved alert rows were visible as sent ones.** Writing the `alerts_sent` row
before the send (needed so links can carry its id) broke an invariant that
`buildAlertContext` documented in a comment. The email renders "vs your last
alert", and that lookup ran mid-send — so the alert would have compared itself to
itself, and a send where every channel failed would still have moved the
threshold floor and silenced the route. Held by `alerts_sent.status` now, not by
ordering.

**Dedup starved every duplicate watcher.** The first version copied the
`PollResult` and skipped `pollOne` entirely for any search sharing a route key —
so the second watcher got no snapshot, no alert evaluation and no email, and
because no snapshot was written their last-polled time never advanced, so they
were deduped again every cycle. Permanent silence. The offers are shared now; the
decision is not.

---

## What is NOT done

**Not in the PDF at all**, despite the title — needs a separate spec:
- B2B
- Client portal

**Specified but not built:**
- *Book panel ordered by expected commission* (Stage 0). Requires a per-partner
  expected-commission table; the click row already records `option_rank` and
  `option_name` so the effect on click-through is measurable the day it ships.
- *Trip totals in the product* — "$484 flight + ~$640 hotel = $1,124" — and
  trip-budget watching (Stage 3). The strongest item on the roadmap and the most
  defensible; it is a feature build, not a wiring job.
- *"Verified N minutes ago" beyond the alert email.* `fareAge.ts` is pure and
  client-safe and ready; the Book panel, share boards and concierge answers still
  show bare numbers.
- *Funnel stages `delivered` and `opened`* need the ESP webhook; `booking
  confirmed` is recorded on the trip but not yet joined into the funnel view.
  Both are shown on the dashboard as explicitly not-instrumented rather than as
  zeros.
- *The multilingual template audit.* The spec predicts stale templates hiding in
  the eight language builds. The English path is through the builder and guarded;
  the localized alert templates have not been swept.

**Known pre-existing, not touched:**
- A hydration warning on every `/admin/*` page, including pre-existing ones. It
  lives in the admin layout.
- `src/lib/affiliate.ts` has duplicate keys (`CUN`, `PUJ`, `NAS`) in its city map.

---

## Settings this adds

All editable in `/admin/settings`, none in code, because provider pricing and
quality change:

| Key | Default | What it does |
|---|---|---|
| `provider_costs` | JSON | USD per call, per provider. Frozen onto each `api_calls` row at write time |
| `poll_budget_monthly_usd` | `0` | `0` = uncapped. 80% demotes a band, 100% is hot-only |
| `poll_allocator_mode` | `tier-capped` | See above |
| `poll_priority_weights` | JSON | The six scoring weights |
| `provider_routing` | — | band → provider ids |
| `verify_providers` / `verify_providers_priority` | — | Which providers run the pre-send check |
| `verify_agreement_pct` / `verify_tolerance_pct` | `2` / `8` | Agreement and dead-fare bands |

## Before deploying

1. The migrations were applied to a copy of `data/fares.db` first — columns
   added, row counts unchanged, `integrity_check` ok. Run against a prod copy too.
2. `routeKey`'s format changed (it now carries the return window). Existing
   `api_calls.route_key` values will not match new ones; analytics group by key,
   so this creates new groups rather than corrupting old ones.
3. Verdict accuracy returns `null` below 20 scored calls. Do not put it on the
   marketing site until it returns a number.
