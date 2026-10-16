# Backend hardening: findings, fixes and evidence

This document records a hardening pass over the BitBack backend, carried out
after the system was first deployed (Render web service, Neon Postgres, EAS
Android build). It is written to be adapted into the testing and security
chapters of the final report: every finding states the problem, how it was
found, what changed, and which test proves the change.

## 1. Method

The pass started from one observation: **the system had only ever been tested
on SQLite, but production runs on Postgres.** Everything else followed from
taking the deployed environment seriously - its database, its proxy, its
free-tier lifecycle, and what a hostile or unlucky client can send it.

Four techniques were used:

1. **Run the existing suite against the production database engine.** A local
   Postgres 16 server (a version Neon offers), with the full suite pointed at
   it through `TEST_DATABASE_URL`.
2. **Reproduce before fixing.** Each bug was first shown failing - by a
   test, or for races, by a test that forces both requests into the race
   window with a thread barrier - and only then fixed.
3. **Check that each new test can fail.** After a fix, the fix was reverted
   (or a key line removed) and the new test run again to confirm it fails.
   This caught one test that passed against the broken code (finding F19),
   which was rewritten.
4. **Audit dependencies and measure.** `pip-audit`, `npm audit`, and a
   SQL statement count per endpoint.

### Baseline and result

| | Before | After |
|---|---|---|
| Backend tests (SQLite) | 104 passed | 159 passed, 2 skipped (Postgres-only race tests) |
| Backend tests (Postgres 16) | not run - 1 failure when first run | 161 passed |
| CI jobs | SQLite tests, mobile | + Postgres: `alembic upgrade head`, `alembic check`, full suite |
| `pip-audit` (requirements.txt) | 33 distinct advisories in 6 packages (reported as 55 findings) | 0 |
| `npm audit --omit=dev` (mobile) | 49 (1 critical, 32 high) | 43 (0 critical, 25 high), all in Expo build tooling - see section 4 |
| Mobile typecheck / unit tests | pass / 28 passed | pass / 28 passed |
| Evaluation harness (`python -m evaluation.run`) | baseline output | identical output - no model behaviour changed |

## 2. Findings and fixes

Severity reflects consequence in this system: **High** means money created or
paid wrongly, an account taken over, or a feature down in production;
**Medium** means degraded security, availability or data validity; **Low**
means hygiene with a plausible path to harm.

### 2.1 Database parity

**F1 - Monthly recap returned 500 for every user on Postgres (High).**
Postgres sums a `BIGINT` column to `NUMERIC`, which the driver returns as
Python `Decimal`; SQLite returns `int`. `Decimal * float` raises, so
`GET /api/analytics/recap` failed for any user with transactions - in
production only. *Found by* running the suite on Postgres (first failure).
*Fix:* convert the aggregate to `int` where it enters Python
(`app/routers/analytics.py`). *Test:*
`test_recap_ranks_a_user_against_their_peers`, which fails on Postgres without
the fix; the Postgres CI job now guards the whole class of bug.

**F2 - SQLite ignored foreign keys, hiding invalid data in tests (Medium).**
SQLite parses `REFERENCES` and then ignores it unless `PRAGMA foreign_keys=ON`
is set on every connection. A forecast test helper wrote `transaction_id=0`
into `reward_events`, a row Postgres would reject. *Fix:* the pragma is set
for every SQLite engine (`app/database.py`); the helper creates real parent
rows. This later made F22's test able to detect a missing cascade.

**F6 - `create_all` on Postgres conflicted with Alembic (Medium).** The
startup hook created any missing tables on every boot. Against Postgres that
creates tables Alembic has no record of, and the next `alembic upgrade head`
fails trying to create them. *Fix:* `create_all` runs only for local SQLite;
Alembic owns the production schema (it runs in the Render build). CI now runs
`alembic check`, which confirms models and migrations agree.

### 2.2 Bitcoin price and payouts

**F3 - Rewards could be paid at an invented price (High).** If the first
CoinGecko request after a restart failed - for example because CoinGecko
throttled the shared cloud address the server sends from - the service fell back to a hard-coded $65,000 and paid
rewards against it, whatever bitcoin actually cost. *Fix:* every price now
carries its `source` and age (`app/btc_service.py`). `price_for_reward()`
declines with 503 in production when the price is the fallback or older than
`BTC_PRICE_MAX_AGE_SECONDS` (30 minutes). Development still runs offline.
*Tests:* `test_production_declines_a_reward_at_an_invented_price` (also
asserts no transaction was written), `..._at_an_old_price`,
`test_development_still_works_offline`.

**F4 - A provider outage put a network timeout on every request (Medium).**
Once the cache expired, every caller retried the provider, so an outage made
each price-dependent request wait for a timeout. *Fix:* a failed fetch is not
retried for 30 seconds, and Coinbase's spot price is tried when CoinGecko
fails. *Tests:* `test_a_failed_fetch_is_not_retried_on_every_request` (five
calls, one network attempt), `test_a_second_provider_covers_the_first`.

**F5 - Price alerts could fire against the fallback price (Medium).** An alert
set below $65,000 would fire on a cold start with no real price, telling the
user bitcoin crossed a level it never reached. *Fix:* the sweep skips stale
prices. *Test:* `test_alerts_never_fire_against_the_fallback_price`.
`GET /api/btc/price` now also returns `stale` and `age_seconds` so the client
can say so.

**F12 - A double-tapped purchase returned 500 (Medium).** Two simultaneous
requests with one idempotency key both passed the "already recorded?" lookup.
The unique constraint still blocked the second payout, but as an unhandled
`IntegrityError`. *Reproduced* on Postgres with a barrier holding both
requests inside the window. *Fix:* the constraint is the check - on conflict
the transaction rolls back and the caller gets the 409 a sequential replay
gets. *Test:* `test_a_double_tap_pays_once_and_the_loser_gets_409` (200 and
409; exactly one transaction and one cashback ledger row).

**F13 - Deleting a savings goal twice at once refunded it twice (High).** Both
requests read the goal's balance before either deleted it, so sats were
created from nothing. *Reproduced* the same way: final balance was 10,000
sats too high. *Fix:* the goal row is locked (`SELECT ... FOR UPDATE`) for
allocate and delete, always goal-then-wallet so two requests cannot deadlock.
*Test:* `test_deleting_a_goal_twice_at_once_refunds_once` (200 and 404;
balance increases once).

**F14 - Non-finite and oversized numbers crashed the API (Medium).** Python's
JSON parser accepts `NaN` and `Infinity`, and pydantic accepted them as
floats. An `Infinity` price alert was *saved*, after which listing that user's
alerts failed permanently. Unbounded integers reached Postgres as "bigint out
of range", and a $1e300 reward preview returned a 300-digit number. *Fix:*
every request body rejects non-finite floats; sats fields are capped at the
21 million BTC supply; the reward preview shares the $1M purchase cap. The
422 handler no longer echoes rejected input (F15: a `NaN` cannot be encoded
as JSON, so the error handler itself crashed). *Test:*
`test_out_of_range_numbers_are_a_422_not_a_crash`, six cases.

### 2.3 Authentication and abuse

**F9 - Two production safety settings were enforced only by documentation
(High).** `DEMO_MODE=true` (the default) returns password-reset tokens to
whoever asks - an account takeover for anyone who knows an email address -
and a SQLite `DATABASE_URL` is wiped on every Render deploy. *Fix:* production
refuses to start on either, alongside the existing secret check, in one
model validator (`app/config.py`). F21 added a 32-byte minimum for the HS256
secret (RFC 7518 s3.2). *Tests:* `tests/test_config.py`.

**F16 - A password-reset link worked any number of times (High).** A reset
token was valid for its full 15 minutes, reusable, even after the password
had changed. **F17 - A reset did not sign out other devices (Medium).**
Stateless JWTs cannot be revoked without server state. *Fix for both:*
session and reset tokens carry `pwv`, a fingerprint of the password hash they
were issued against. A password change invalidates every earlier token, so a
link works once and a reset ends every session. *Tests:*
`test_a_reset_link_works_only_once`,
`test_resetting_the_password_signs_out_every_device`.

**F10 - Rate limits could be bypassed by setting a header (Medium).** Behind
Render's proxy the limiter read the first `X-Forwarded-For` entry, which the
client controls, so a new value per request bypassed every limit - including
on registration, which pays a referral bonus. Render's behaviour here is not
documented, so the fix is configurable rather than assumed:
`CLIENT_IP_SOURCE` selects `direct`, `x-forwarded-for` (the default,
unchanged) or `cf-connecting-ip` (set by Cloudflare, which overwrites client
values). `GET /api/meta/client-ip` lets the operator verify the deployment
(DEPLOY.md, step 5). *Tests:* `test_x_forwarded_for_can_be_spoofed_by_the_client`
documents the weakness; `test_a_spoofed_header_cannot_dodge_the_signup_limit`
proves the fix.

**F18 - Password and 2FA guessing was limited per address only (Medium).**
Guesses at one account could be spread across addresses. *Fix:* per-account
limits - login 10 per 15 minutes; 2FA authenticate, verify and disable 5 per
minute (a 6-digit code accepts 3 values at once with `valid_window=1`).
*Tests:* `test_password_guessing_is_limited_per_account_not_just_per_address`,
`test_2fa_codes_are_limited_per_account`.

**F19 - The rate limiter's clean-up could reset a long limit early
(Medium).** The periodic sweep applied the *calling* request's window to
every key, so a one-minute login check deleted the one-hour signup counters.
*Fix:* each key keeps its own window. *Test:*
`test_a_long_window_survives_a_sweep_triggered_by_a_short_one`. The first
version of this test passed against the broken code, because its fake clock
sat behind the sweep timestamp so no sweep ran; it was found by the
revert-and-rerun check and rewritten.

**F11 - The survey would have turned away respondents on campus Wi-Fi
(Medium).** The survey allowed 5 submissions per address per hour, and a
campus NAT puts a lecture theatre behind one address. *Fix:* 60 per hour,
still enough to stop a script.

**F20 - Known-vulnerable dependencies (Medium).** `pip-audit` found 33
distinct advisories: PyJWT 2.10.1 (16), Starlette 0.41.3 (7, held there by
FastAPI 0.115's pin), python-multipart (6), requests (2), python-dotenv (1)
and pytest (1).
*Fix:* FastAPI 0.143.3 / Starlette 1.8.0 and patched versions of the rest;
`pip-audit` now reports none, and the full suite passes on the new versions.
On mobile, axios (the only runtime dependency flagged) moved to 1.20.0 and
the critical advisory is gone.

### 2.4 Release prerequisites

**F22 - No way to delete an account (App Store blocker).** Guideline
5.1.1(v) requires in-app deletion for apps that create accounts. *Fix:*
`DELETE /api/auth/me` re-checks the password, then deletes the user and every
dependent row. Referral rows - which point at two users and belong to
neither, so the ORM cascade does not reach them - are removed for both sides;
sats already paid to the other party stay with them. Mobile: More -> Delete
account, with a native confirmation that names the consequence. *Test:*
`test_deleting_an_account_leaves_no_row_behind` finds every foreign key to
`users.id` from the schema metadata and asserts none still references the
user, so a table added later is covered automatically. With the referral
clean-up removed it fails on a foreign-key violation (possible only since F2).

**F23 - No privacy policy (App Store blocker).** *Fix:* `GET /privacy`,
written against what `app/models.py` actually stores, what is not collected
(no location, contacts, device IDs or tracking SDKs - checked against
`mobile/package.json`), the third parties involved, and how deletion works.

**F24 - A production build would have called `localhost` (High for
release).** `eas.json` set `EXPO_PUBLIC_API_URL` only on the `preview`
profile; on a phone, `localhost` is the phone. *Fix:* the URL is set once in a
`base` profile that both profiles extend. **F25:** the iOS
`ITSAppUsesNonExemptEncryption=false` flag (HTTPS and keychain only) skips the
export-compliance prompt on each TestFlight upload.

### 2.5 Research data

**F26 - Q4-Q7 averages mixed two groups of respondents (Medium - validity).**
Responses stored before the "have you used the app?" question existed answered
Q4-Q7 whether or not they had seen those screens. The summary excluded them
from `used_app_count` but included their answers in the Q4-Q7 means, so each
mean and its reported n described different groups of people. *Fix:* Q4-Q7
are analysed over `used_app` respondents only; pre-migration ("legacy")
answers are reported separately and never deleted. Q1-Q3, asked of everyone,
include them. *Test:*
`test_pre_migration_answers_are_not_pooled_with_grounded_ones`.

**F27 - Likert items were summarised by mean only (Low - method).** Likert
responses are ordinal. *Fix:* each item now reports n, median, interquartile
range and the full distribution; the mean is kept for comparison.
`scripts/export_survey.py` exports every row with its cohort for analysis.

### 2.6 Operations

| ID | Finding | Fix |
|---|---|---|
| F7 | The alert sweep first ran one interval after boot; a free instance is woken by someone opening the app | Sweep at startup, then on the interval |
| F8 | `/api/health` said "ok" with the database down | Runs `SELECT 1`; 503 if it fails (use as Render's health check) |
| F28 | The tax report's default year used the server's local date | UTC date, like every other timestamp |
| F29 | Concurrent requests' log lines could not be told apart | `X-Request-ID` on every response and log line |

**F31 - Errors came back in four different shapes (Low).** `detail` was a
string, an object (the 409), or a list (422), and a 500 added `reference`; a
client had to know which to expect. *Fix:* every error response is
`{"message", "request_id", "detail"}` - `message` is always one readable
sentence, `request_id` matches the `X-Request-ID` header and the log, and
`detail` is unchanged so existing clients keep working. The mobile client now
reads `message` first. *Test:* `test_every_error_has_the_same_envelope`
covers 401, 404 (raised and unknown route), 405, 409 and 422.

### 2.7 Indexes, measured

**F30 - Deleting a long-standing account took 26 seconds (High).**
Postgres does not index foreign keys automatically, and
`reward_events.transaction_id` had none. Deleting a purchase makes Postgres
check that no reward still references it, and without an index each check
scans the whole table. *Found by* seeding Postgres 16 with 40k purchases,
100k price alerts and 40k notifications (the heaviest user holding 20,000
purchases) and measuring with `EXPLAIN ANALYZE`. Deleting that user's
purchases spent 25.9 s in this one check - longer than the mobile app's 12 s
request timeout, so the account could not be deleted from the app. The same
seeding showed three hot queries reading far more rows than they return.

| Query | Before | After | Index (migration `d7a3e9b1c5f2`) |
|---|---|---|---|
| Delete 20,000 purchases (foreign-key checks) | 26,394 ms | 323 ms | `reward_events (transaction_id)` |
| Alert sweep, every 60 s - 200 pending of 100,000 | 6.1 ms, full scan | 0.61 ms | partial: `price_alerts (user_id) WHERE NOT is_triggered` |
| Unread count - 40 unread of 20,000 | 2.4 ms | 0.05 ms, index-only | partial: `notifications (user_id) WHERE NOT is_read` |
| Flagged purchases - 400 of 20,000 | 2.3 ms | 0.67 ms | partial: `transaction_risk_scores (user_id) WHERE is_anomaly` |
| Reward for one purchase | 2.9 ms, full scan | 0.03 ms | `reward_events (transaction_id)` |

The partial indexes cover only the rows those queries want, so they stay
small as history accumulates; the sweep in particular now costs what is
pending, not what has ever existed. *Test:*
`test_every_foreign_key_is_the_leading_column_of_an_index` reads the schema
and fails if any foreign key lacks an index that starts with it - with the
new index removed it reports `reward_events.transaction_id` by name. The
migration was applied, downgraded and re-applied on SQLite and Postgres, and
`alembic check` confirms the models declare the same indexes.

## 3. Measurement: queries per request

SQL statements issued per request for a user with 200 purchases, counted with
a SQLAlchemy `before_cursor_execute` listener:

| Endpoint | Statements |
|---|---|
| `GET /api/wallet` | 3 |
| `GET /api/transactions` | 3 |
| `GET /api/rewards/summary` | 6 |
| `GET /api/analytics/insights` | 5 |
| `GET /api/analytics/recap` | 6 |
| `GET /api/analytics/spending?period=all` | 3 |
| `GET /api/notifications` | 4 |
| `GET /api/forecast` | 2 |
| `GET /api/fraud/summary` | 3 |
| `GET /api/fraud/flagged` | 2 |
| `GET /api/ai/boost-recommendation` | 3 |
| `GET /api/ai/persona` | 2 |
| `POST /api/transactions` | 26 (reward, ledger, streak, badges, fraud score, notifications) |

No read endpoint's count depends on history length, which rules out an N+1.
`tests/test_query_budget.py` keeps it that way: it measures all twelve read
endpoints at 10 and 60 purchases and fails if any count grows.

## 4. Found but not fixed

| Issue | Why it is left | Mitigation |
|---|---|---|
| A TOTP code can be replayed within its ~90 s acceptance window | Needs a per-user "last used time step" column and migration | Per-account limit of 5 attempts/min (F18) |
| TOTP secrets and backup codes are stored unencrypted | Needs a key-management design; hashing backup codes needs a data migration | Database access is limited to the Neon credentials |
| Rate limiter and model cache live in process memory | A shared store (Redis) is out of scope for a free deployment | Single worker is documented as required (DEPLOY.md) |
| Price alerts cannot fire while the free instance sleeps | Platform limitation | Sweep on wake (F7); documented |
| 43 npm advisories remain | All in Expo's build tooling (CLI, Metro, dev server, XML/CSS parsers), not in the app bundle; fixing needs Expo SDK 58 / React Native 0.88, a major upgrade | Accepted risk until after submission |
| Correct `CLIENT_IP_SOURCE` for Render is unverified | Render does not document its forwarding headers | Operator check in DEPLOY.md step 5 |
| The EAS `extends` configuration was not resolved with `eas-cli` | Requires an Expo login | Uses the documented `extends` key; run `eas config --profile production` once |
| Streak days are UTC, not the user's local day | Needs a stored per-user timezone | Documented in `app/clock.py` |
| Persona and recommender load a user's full purchase list into memory | Constant query count; memory grows linearly, which is fine at prototype scale | Would move to SQL aggregation at scale |

## 5. Reproducing the results

```bash
pip install -r requirements.txt
pytest                                    # SQLite
TEST_DATABASE_URL=postgresql://... pytest # Postgres; includes the race tests
alembic upgrade head && alembic check     # schema and models agree
# Index measurements (F30): see scripts/index_benchmark/README.md
pip-audit -r requirements.txt
cd mobile && npm ci && npm run typecheck && npm test && npm audit --omit=dev
python -m evaluation.run                  # model evaluation, unchanged by this pass
```
