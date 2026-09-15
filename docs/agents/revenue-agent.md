# Revenue Agent

`src/agents/revenue/index.ts` · export `runRevenue()` · job `agent-revenue` · timer `deploy/egyptair-jobs-agent-revenue.timer`

---

## 1. Purpose

The revenue agent answers exactly one question, once a day:

> **Has real money arrived since the last run, and where did it come from?**

It is not a dashboard, not a forecaster, and not a growth model. It reads the
money that is actually recorded in SQLite, compares it to the figures it stored
on its previous run, and emails Myron **only when something material changed**.
When nothing happened it stays silent — a "nothing happened" email every morning
trains the reader to ignore the channel, which defeats the point of the alert.

Secondarily it appends a short **how to earn more** section, every line of which
is tied to a count it actually read out of the database.

---

## 2. "Real money" vs forecast

This project has been burned by models fabricating figures. The rule is absolute:

| Counts as REAL money (may be reported) | Does NOT count (never reported as earnings) |
|---|---|
| Travelpayouts balance in `settings.tp_balance_usd`, written by a successful API pull | A projected balance, a run-rate, an annualised figure |
| Rows in `commission_events` (confirmed partner payouts/postbacks) | Clicks × an assumed per-click rate |
| Billed subscribers in `users` at known list prices, owner excluded | "If we converted X% of free users…" |
| | Any number produced by the LLM |

Three derived rules follow:

1. **Unknown is never zero.** If `tp_balance_usd` is unset, empty, or unparseable,
   the brief says *"balance unknown"*. It never prints `$0`. Conversely
   `commission_events` having zero rows *is* a real zero and is reported as
   "0 rows all-time", because the absence of rows is itself a DB fact.
2. **Stale is never current.** If `tp_balance_error` is non-empty, the last known
   balance is reported explicitly labelled STALE, with `tp_balance_updated_at`
   and the error text, and it is not allowed to trigger an alert or to overwrite
   the stored baseline.
3. **Reference rates are assumptions, not money.** The $0.55/hotel-click,
   $0.10/flight-click, EKTA 20–25%, Kiwitaxi 50% figures come from programme
   terms (recorded in `src/lib/affiliate.ts` comments), **not** from the
   database. They may be quoted to justify a recommendation. They are never
   multiplied by a click count to produce a dollar figure.

---

## 3. Data sources — exact tables and keys

Every figure in the brief traces to one of these. Nothing else is read.

### 3.1 Travelpayouts balance — `settings` table
| Key | Written by | Used for |
|---|---|---|
| `tp_balance_usd` | `pullCommissions()` in `src/lib/travelpayoutsStats.ts` (`String(n)`) | The balance figure |
| `tp_balance_updated_at` | same | Freshness stamp shown in the brief |
| `tp_balance_error` | same (`''` on success) | Non-empty ⇒ balance is STALE |

Read via `queries.getSetting()` (`src/lib/db.ts`).

### 3.2 Commissions — `commission_events` table
Columns used: `partner`, `amount_usd`, `booking_id`, `received_at`, `click_token`.

- **All-time totals** — `SELECT COUNT(*), COALESCE(SUM(amount_usd),0) FROM commission_events`.
  All-time, *deliberately not* the 30-day helpers in `db.ts`
  (`commissionsByPartner30d`, `monthlyAffiliateStats`). Rolling windows shrink as
  rows age out, and a diff against a shrinking window would report money
  *vanishing*. The run-to-run diff must be monotonic, so it runs on all-time counters.
- **All-time by partner** — grouped, for attribution.
- **30d by partner** — `queries.commissionsByPartner30d()`, narrative only.
- **Recent rows** — newest 10, LEFT JOINed to `affiliate_clicks` on
  `affiliate_clicks.token = commission_events.click_token` so the brief can name
  the provider and surface that produced the booking.
- **Converted surfaces** — INNER JOIN of the same two tables grouped by
  `(surface, provider)`. With zero commission rows this returns `[]` and the
  brief says *"no conversions recorded"*; it must never name a winner.

> As of this writing `commission_events` has **0 rows all-time**. Every
> commission figure is therefore currently a true zero, and the agent says so.

### 3.3 Subscriptions — `users` table
Columns: `email`, `tier`, `subscription_status`.

```sql
SELECT COALESCE(tier,'free') AS tier, COUNT(*) AS count
  FROM users
 WHERE LOWER(COALESCE(subscription_status,'')) IN ('active','trialing','past_due')
   AND (:owner = '' OR LOWER(COALESCE(email,'')) <> :owner)
 GROUP BY tier
```

Prices: `pro = $9/mo`, `enterprise = $39/mo` (constant `PRICE_USD`).

**Owner exclusion — the phantom-MRR bug.** The owner (`OWNER_EMAIL`) is a comp
account. Counting him produces MRR that does not exist. That bug was fixed once
already and must not come back. Consequences baked into the code:

- `OWNER_EMAIL` is read from `process.env` directly, **not** via
  `src/lib/auth.ts#ownerEmail()`, because `auth.ts` imports `next/headers` which
  the standalone `scripts/run-job.mjs` runner does not provide.
- If `OWNER_EMAIL` is **unset**, the agent cannot exclude him, so it **refuses to
  report MRR at all** and records the reason in the "NOT KNOWN" section. It does
  not fall back to a possibly-inflated number.
- A billed user on a tier with no entry in `PRICE_USD` is counted as $0 toward
  MRR and the tier is named in the brief, so MRR is declared as a **floor**.

`db.ts:adminMetrics()` (`mrr_usd: pro * 9 + enterprise * 49`) is the *old* path:
no status filter, no owner exclusion, and $49 for enterprise. **It is deliberately
not used here.** The $39-vs-$49 discrepancy is unresolved — see §9.

### 3.4 Clicks — `affiliate_clicks` table
- `queries.clicksByProvider30d()` → provider mix over 30 days
- `queries.clicksBySurface30d()` → which surfaces generate clicks

Bucketing (provider list from `src/lib/affiliate.ts`):

| Bucket | Providers |
|---|---|
| hotel | `hotellook`, `booking`, `expedia` |
| attach (high value) | `ekta`, `kiwitaxi` |
| flight | `aviasales`, `aviasales-tpk`, `wayaway`, `tripcom`, `skyscanner`, `kayak`, `momondo`, `google`, `egyptair` |
| other | everything else (legacy/untagged) |

### 3.5 Audit trail
`queries.insertAudit({ user_id: null, email: null, action, entity: 'agent:revenue', detail, ip: null })`
on every run (`revenue_agent.run`) and on every numeric-guard trip
(`revenue_agent.guard_tripped`). The full facts/delta blob also goes to
`agent_runs.output_json` via `finishRun()`.

---

## 4. State it persists (`settings` keys)

All prefixed `revenue_agent_`. Written on **every** run, including DRY_RUN and
including silent runs — otherwise a DRY_RUN run would re-alert on the same money
forever.

| Key | Meaning |
|---|---|
| `revenue_agent_baseline_at` | ISO timestamp of the first-ever run. Its presence is what makes a run "not the first run". |
| `revenue_agent_last_run_at` | ISO timestamp of the most recent run |
| `revenue_agent_last_tp_balance_usd` | Last **known and fresh** balance. A stale or unknown balance does not overwrite this. |
| `revenue_agent_last_commission_count` | All-time `COUNT(*)` of `commission_events` |
| `revenue_agent_last_commission_sum_usd` | All-time `SUM(amount_usd)` |
| `revenue_agent_last_paid_subscribers` | Billed subscriber count, owner excluded |
| `revenue_agent_last_mrr_usd` | MRR, owner excluded. Not written when MRR was withheld. |
| `revenue_agent_last_alert_at` | ISO timestamp of the last successfully delivered alert email |
| `revenue_agent_payout_threshold_usd` | **Operator-tunable input.** Payout threshold in USD. Default `50` when unset/invalid. |

---

## 5. Alert rules

An email is sent **only** when at least one trigger fires. Triggers:

| Trigger | Condition |
|---|---|
| `new-commission` | all-time `COUNT(*)` of `commission_events` > `revenue_agent_last_commission_count`. If `revenue_agent_last_commission_sum_usd` is missing, the trigger still fires but the dollar amount is reported as **unknown** — it is never computed against an assumed prior of `0`, which would report the entire all-time total as new money. |
| `balance-up` | balance is known AND fresh AND `balance - revenue_agent_last_tp_balance_usd > 0.005` |
| `payout-threshold` | balance is known AND fresh AND crossed the threshold this run (`now >= threshold` and `prev < threshold`) — edge-triggered, so it fires once, not every day above the line |
| `subscriber-gained` / `subscriber-lost` | billed subscriber count (owner excluded) differs from `revenue_agent_last_paid_subscribers` |

Silence rules:

- **First run is always silent.** With no `revenue_agent_baseline_at`, the agent
  stores the baseline and sends nothing. Pre-existing figures are not "new money".
- A balance *decrease* does not alert (that is a payout leaving, expected), but it
  is shown in the brief when something else triggered.
- A stale or unknown balance never triggers anything.
- If a trigger fires but `AGENT_ADMIN_EMAIL` is unset, the run records the
  undelivered alert in the "NOT KNOWN" section and in `agent_runs`.

Email goes out via `sendOperatorBrief()` from `src/lib/email.ts`
(subject `FlyCheap revenue — <triggers> — YYYY-MM-DD`), the same path insights uses.

---

## 6. Anti-fabrication guardrails

1. **Money never touches the model.** Every dollar figure is formatted in
   TypeScript (`usd()`) from a value read out of SQLite. The LLM is used for one
   thing only: 3–5 sentences of qualitative "how to earn more" prose.
2. **Numeric allow-list guard.** `buildNumberAllowlist(facts)` collects every
   number the agent actually read (balance, commission counts/sums, subscriber
   counts, MRR, all click counts and percentages, list prices, the reference
   rates, and the literal `30` for the window). `ungroundedNumbers(text, allowed)`
   extracts every numeric token from the model's draft and returns those not in
   the set. If the list is non-empty the prose is **discarded**, an audit row
   `revenue_agent.guard_tripped` is written with the offending tokens, and the
   deterministic fallback text is used instead. `adviceGuardTripped` is returned
   and logged. This mirrors the `BANNED_PHRASES` / `voiceFlags` self-check
   pattern used by the social poster.
3. **Deterministic fallback.** `deterministicAdvice()` is pure TypeScript and is
   used whenever `ANTHROPIC_API_KEY` is missing, the model ping fails, the call
   errors, or the guard trips. Unlike the insights agent, a missing API key is
   **not fatal** here: the money numbers are the deliverable and they need no model.
4. **Explicit unknowns.** Anything the agent could not determine is listed in a
   "NOT KNOWN (stated rather than guessed)" block at the foot of the brief and
   returned as `unknowns[]`. The agent states ignorance rather than filling gaps.
5. **Provenance footer.** Every brief ends by naming the tables/keys the figures
   came from and restating that the reference rates are not earnings.

---

## 7. DRY_RUN behaviour

Identical to `src/agents/insights/index.ts`, and for the same reason.

`isDryRun()` defaults to **true** unless `AGENT_DRY_RUN=false`. DRY_RUN gates
**public broadcasting**, which this agent never does — it only emails the owner.
So under DRY_RUN:

- the operator email **is still sent** (it is internal, owner-only);
- the `revenue_agent_*` settings **are still written** (internal bookkeeping;
  skipping them would make every DRY_RUN run re-alert on the same money);
- `dryRun` is recorded on the `agent_runs` row and in the run summary.

Nothing about the money reads changes under DRY_RUN.

---

## 8. Schedule and manual operation

**Timer:** `deploy/egyptair-jobs-agent-revenue.timer`, daily at **08:30
America/New_York**, `Persistent=true`, `Unit=egyptair-jobs@agent-revenue.service`.
08:30 deliberately avoids the insights brief at 08:00 and the auto-poster at 09:00.
Daily is the right cadence: commissions land via the daily `commissions` pull, so
a faster cadence would just re-read the same numbers.

Install (on the server, alongside the other timers):

```bash
cp deploy/egyptair-jobs-agent-revenue.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now egyptair-jobs-agent-revenue.timer
systemctl list-timers | grep agent-revenue
```

`deploy/deploy.sh` keeps an explicit list of timers it *pauses* during a deploy
(lines ~78-89). That list contains none of the agent timers today, so
`agent-revenue` was intentionally not added — if agent timers are ever added to
that pause list, add `egyptair-jobs-agent-revenue.timer` with them. Nothing in
`deploy.sh` or `setup.sh` installs timers, so installation is manual (above),
same as for curator/insights/storyteller/social-poster.

**Manual run:**

```bash
npx tsx scripts/run-job.mjs agent-revenue
# or on the server:
systemctl start egyptair-jobs@agent-revenue.service
journalctl -u egyptair-jobs@agent-revenue.service -n 100 --no-pager
```

The job prints the full brief to stdout, so a manual run is also the inspection
surface. It takes the `agent-revenue` job lock, so it cannot double-fire with the
timer.

**Reset the diff state** (forces the next run to be a silent baseline run):

```sql
DELETE FROM settings WHERE key LIKE 'revenue_agent_%';
```

**Change the payout threshold:**

```sql
INSERT INTO settings(key, value) VALUES ('revenue_agent_payout_threshold_usd','50')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
```

**Environment:** `OWNER_EMAIL` (required for MRR), `AGENT_ADMIN_EMAIL`
(alert recipient), `RESEND_API_KEY` + `RESEND_FROM` (delivery),
`ANTHROPIC_API_KEY` (optional — prose only), `AGENT_DRY_RUN`.

---

## 9. Known gaps / not verified

- **Enterprise price.** This agent uses **$39/mo**; `db.ts:adminMetrics()` uses
  **$49/mo**. Both are hard-coded assumptions, neither is read from Stripe. One
  of them is wrong. Reconcile against the live Stripe price objects.
- **Payout threshold $50** is a default, not a figure read from Travelpayouts.
  Confirm the real minimum and set `revenue_agent_payout_threshold_usd`.
- **Per-click reference rates** ($0.55 hotel / $0.10 flight) and the EKTA 20–25% /
  Kiwitaxi 50% shares are programme terms from code comments, never measured
  against our own bookings (there are none yet).
- **Attribution has never been proven end to end.** With 0 rows in
  `commission_events`, the `click_token → affiliate_clicks.token` join is
  untested against real data. The first real commission is also the first test of
  whether attribution works at all.
- **`subscription_status` values** are matched case-insensitively against
  `active`/`trialing`/`past_due`. Other statuses seen in the schema comments
  (`canceled`, `founding_free`, `upgrade_due`) are correctly excluded as
  not-billed, but confirm no Stripe status string is being missed.

---

## 10. How to extend it

- **New revenue source** (e.g. a second affiliate network, or Stripe invoices
  read directly): add a `readX()` function in the reads section that returns
  `null` for unknown, add its figures to `RevenueFacts`, add them to
  `buildNumberAllowlist()`, format them in `moneySection()`, and add a
  `revenue_agent_last_x` key to `SETTING_KEYS` + `persist()` + `diff()`. Keep the
  diff on an all-time monotonic counter, never a rolling window.
- **New alert rule:** push a trigger string in `diff()`. Anything in
  `delta.triggers` breaks the silence, so only push for things worth waking
  someone up for.
- **New advice input:** add the counts to `earnMoreFacts()` (which is what the
  model is shown) *and* to `buildNumberAllowlist()` — a number in the prompt but
  not in the allow-list will trip the guard and silently discard the prose.
- **Do not** add a figure to the brief that has no DB read behind it. If you need
  one, add the read first.
