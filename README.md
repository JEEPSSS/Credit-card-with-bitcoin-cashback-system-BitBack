# BitBack — bitcoin cashback card

A card that pays cashback in satoshis instead of points, with the reward engine,
gamification, and five analytical models running on the user's own transaction
history. FastAPI backend, Expo (React Native) mobile app.

## Run it

**Backend**

```bash
pip install -r requirements.txt
cp .env.example .env
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
python test_api.py        # 47 checks across the whole API surface
```

## Layout

```
app/
  reward_engine.py      cashback maths, levels, round-up      (pure, testable)
  gamification.py       streaks and the ten badges
  anomaly_detector.py   Isolation Forest fraud scoring
  ml_forecast.py        damped Holt's + linear regression ensemble
  smart_recommender.py  weighted ranking for boost suggestions
  spending_persona.py   nearest-centroid cosine classification
  auth.py               JWT, bcrypt, TOTP helpers
  models.py schemas.py database.py btc_service.py
main.py                 47 routes
seed_demo.py            demo data generator
test_api.py             end-to-end suite
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

Three of these needed real debugging rather than tuning, and the reasoning is
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
  synthetic series.
- **Deleting a user left orphaned rows.** SQLAlchemy's bulk `query().delete()`
  bypasses ORM cascade rules. Object-level `db.delete()` is required.

## Design

Colour values derive from the Radix Colors dark scale and are checked against
WCAG 2.2 AA. Touch targets are 48dp, satisfying both the Apple HIG 44pt minimum
and Material 3's 48dp. Type is a 1.25 modular scale, six sizes, two weights.
Spacing is a 4pt grid. Two corner radii. The rationale for each value is in
`mobile/lib/theme.ts`.

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
