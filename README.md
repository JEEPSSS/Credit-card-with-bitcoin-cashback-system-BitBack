# BitBack — bitcoin cashback card

A card that pays cashback in satoshis instead of points, with the reward engine,
gamification, and five analytical models running on the user's own transaction
history. FastAPI backend, Expo (React Native) mobile app.

## Run it

**Backend**

```bash
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head                      # create the schema
python seed_demo.py                       # 120 days of demo history
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` matters: a phone on the same network cannot reach `127.0.0.1`.
SQLite is used by default so there is nothing to install; set `DATABASE_URL` in
`.env` to point at Postgres instead.

**Mobile app**

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go. The app derives the API host from the address
Expo is already serving on, so no configuration is needed on the same network.
Override with `EXPO_PUBLIC_API_URL` to point at a deployed backend.

Demo login: `demo@bitback.app` / `demo12345`

**Tests**

```bash
pytest                    # 89 backend tests, each on its own in-memory database
ruff check app main.py seed_demo.py tests
cd mobile && npm test     # 15 front-end tests
```

## Layout

```
app/
  config.py             settings, validated once at import
  clock.py              the one source of UTC time
  reward_engine.py      cashback maths, levels, round-up      (pure, testable)
  gamification.py       streaks and the ten badges
  anomaly_detector.py   Isolation Forest fraud scoring
  ml_forecast.py        damped Holt's + linear regression ensemble
  smart_recommender.py  weighted ranking for boost suggestions
  spending_persona.py   nearest-centroid cosine classification
  services.py           wallet, referral and alert operations
  rate_limit.py         fixed-window limiter
  auth.py               JWT (PyJWT), bcrypt, TOTP helpers
  routers/              47 routes, one module per resource group
  models.py schemas.py database.py btc_service.py
main.py                 app assembly: config, middleware, lifespan, routers
migrations/             Alembic; `alembic upgrade head`
seed_demo.py            demo data generator
tests/                  pytest
mobile/                 Expo app (21 screens)
```

## The five models

| Model | Job | Notes |
|---|---|---|
| Isolation Forest | Score each transaction for fraud | 6 features, all relative to the user's own history |
| Damped Holt's smoothing | 30-day earnings trend | Weekly buckets, φ=0.85 damping |
| Linear regression | Baseline forecast | Ensembled 40% against Holt's |
| Weighted content ranking | Which boost to activate | 5 factors, documented weights |
| Nearest-centroid cosine | Spending persona | 5 fixed centroids in the category simplex |

Several of these needed real debugging rather than tuning, and the reasoning is
written into the module docstrings:

- **Fraud scoring flagged 99% of transactions.** Two causes. Training rows were
  built against progressively shorter histories, so the oldest rows had
  degenerate features that dragged the decision boundary. And when scoring
  backfilled data the history query included transactions *after* the one being
  scored, so "time since last transaction" was zero for every query point and
  positive for every training row. With both fixed, the flag rate matches the
  `contamination=0.05` hyperparameter and the threshold of 60 is anchored to it
  rather than picked by hand.
- **The forecast predicted 10x the observed rate.** Daily sats earned is
  zero-inflated, which destabilises exponential smoothing, and undamped Holt's
  extrapolates the last trend forever. Weekly aggregation plus trend damping
  fixed both; the model is verified against flat, growing, and collapsing
  synthetic series in `tests/test_models_ml.py`.
- **Every new account was told its earnings were growing.** The lookback window
  is thirteen weeks, so a user active for three of them had ten empty weeks
  prepended to their series — weeks before the account existed, counted as weeks
  in which they earned nothing. A flat 10,000 sats/week fits a slope of
  +824/week that way. Leading empty weeks are now trimmed; interior zeros are
  kept, because a quiet week inside an active history is real signal.
- **A sustained decline reported as "stable".** The trend label was read from
  Holt's trend state, which damping deliberately shrinks to about 43% of the
  true weekly slope, and compared against 5% of the mean. The label now comes
  from the least-squares slope, which is what actually describes the series.
- **Deleting a user left orphaned rows.** SQLAlchemy's bulk `query().delete()`
  bypasses ORM cascade rules. Object-level `db.delete()` is required.

**Fraud scoring latency.** Training used to run inside every request: 117 ms at
100 transactions of history, 158 ms at the 500-row cap, of which a flat ~110 ms
was the fit itself. A fitted model is now cached per user and refit only after
`FRAUD_REFIT_INTERVAL` new transactions, so the request path is one
`decision_function` call.

| | Before | After |
|---|---|---|
| Cold (refit) | 126 ms | 131 ms, once per 25 transactions |
| Warm (cached) | — | 4.6 ms |
| Amortised | 126 ms | 9.7 ms |

## Design

Colour values derive from the Radix Colors dark scale and are checked against
WCAG 2.2 AA. Touch targets are 48dp, satisfying both the Apple HIG 44pt minimum
and Material 3's 48dp. Type is a 1.25 modular scale anchored at 16 — five sizes,
one step deliberately skipped between `title` and `display`. Spacing is a 4pt
grid. Two corner radii.

Every one of those values lives in `mobile/lib/theme.ts` with the constraint it
derives from, and the screens import them. That was not previously true: the
file documented a system nothing referenced, colours lived in a component, a
third token set sat unused in a Tailwind stylesheet, and the app used thirteen
distinct font sizes against the six documented. A unit test now asserts the
scale is what the comment says it is.

The balance odometer is the one animated element; everything else is static.
Transactions render as receipt lines sharing one hairline rule with a
right-aligned tabular-mono column, so figures align vertically down the screen.

## Scope note

The brief this was built from specified five models and twenty screens. All are
implemented, but for a dissertation the fraud detector and the forecast are the
two worth writing up in depth — they have real feature engineering and a
falsifiable evaluation. The recommender and persona classifier are deterministic
scoring functions rather than learned models, and describing them as machine
learning in a viva would be hard to defend.

## What is not built

- No real Bitcoin transactions. Withdrawal addresses are stored but nothing is
  broadcast, and no private keys exist anywhere in the codebase.
- No email delivery. `DEMO_MODE` returns the password-reset token in the API
  response so the flow is demonstrable without a mail server; with it off the
  endpoint reveals nothing about whether an address is registered.
- No held-out evaluation of either model. The fraud detector has no labelled
  test set and the forecast is not backtested, so there are no precision,
  recall, or error figures to report yet.
- No deployment. Both halves run locally.
