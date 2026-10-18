# Evaluation of BitBack's models and rule engines

This document is the source for the report's evaluation chapter. It covers
every analytical component in the app: the two machine-learning models (fraud
detection, earnings forecast) and the four rule-based engines (boost
recommender, spending persona, reward engine, gamification). Every number below
comes from `python -m evaluation.run` and is stored in
[`evaluation/results.json`](../evaluation/results.json).

## 1. Method

### 1.1 Why synthetic data, and what it can support

BitBack has no real cardholders, so there is no observed spending and no
labelled fraud. Each suite therefore generates cardholders whose correct answer
is **known by construction**: the persona they were drawn from, the anomalies
injected into their history, or the category they actually spent the most in
after a recommendation was made. The component under test sees only what the
app would see, and its answer is scored against that ground truth.

This shows whether a component does what it was designed to do, and how its
performance changes as the task gets harder. It does **not** show performance
on real people, whose behaviour is not drawn from these generators. Each
section ends with its own limitations.

### 1.2 Principles applied throughout

- **Baselines:** every component is compared against simple alternatives
  (random choice, "repeat last month", a rule set). A component that cannot beat
  the simplest reasonable rule is not earning its complexity.
- **The real code:** suites call the functions the app runs (the same reward
  maths, badge SQL and classifier), not re-implementations. The exceptions are
  retired versions (`v1_rank`, `v1_breakdown`, `v1_round_up_usd`), kept so
  before/after comparisons run on the same inputs. A test pins `v1_rank` to the
  original code's exact output.
- **Uncertainty:** headline numbers are reported as a mean with a 95% percentile
  bootstrap confidence interval (Efron & Tibshirani, 1993). Comparisons between
  two versions are **paired**, computed on the same cardholders, which removes
  between-cardholder variation from the comparison.
- **Separate data for choosing and for reporting:** every change the evaluation
  led to was chosen on *validation* data and is reported on *held-out* data that
  played no part in the decision.

  | Seeds | Used for |
  |---|---|
  | 1–30 (fraud, forecast), 23 (persona) | First evaluation, before any change |
  | 201–230 (fraud, forecast), 230 (persona), 101 (recommender) | **Validation:** choosing changes |
  | 301–330 (fraud, forecast), 330 (persona), 2027 (recommender) | **Held-out:** every number reported below |

- **Keep only what clearly helps:** a change stays only if its paired
  improvement on held-out data has a 95% interval clear of zero and nothing else
  gets significantly worse beyond a limit set in advance (for fraud, at most 1%
  false alarms). One planned improvement failed this test and is reported as a
  negative result (section 3).
- **Checking that a test can fail:** each regression test was run against the
  code before its fix to confirm it fails there.

### 1.3 Summary

| Component | Question | Held-out result | Change made |
|---|---|---|---|
| Fraud detection (Isolation Forest) | Does it catch injected anomalies without flagging normal spending? | F1 **0.887** [0.864, 0.908], recall 0.96, 0.8% false alarms; beats the rule baseline on 30/30 seeds | **Alert threshold 60 → 56, plus a never-seen-hour check:** F1 +0.048 [0.029, 0.068] |
| Earnings forecast | Does it beat "next month = last month"? | Yes for steady (skill 1.15) and growing (1.16) spending; no better for declining (0.99) | **Range replaced by an 80% prediction interval:** coverage 54–69% → 70–82% |
| Boost recommender | Does it pick the category whose boost pays most? | Picks the best category 70.0% of the time vs 60.7% for v1 (+9.3 pts [5.7, 13.2]) | **Ranking replaced** (expected value) |
| Spending persona | Is the persona right, and is its confidence honest? | 75.5% right after 20 purchases, calibrated (ECE 0.04); 58.5% after 5 | **Unlock 5 → 20 purchases; Balanced wins near-ties:** +1.6 pts [0.8, 2.3] |
| Reward engine | Does the arithmetic hold for every purchase? | 0 violations in 200,000 purchases; totals within ½ sat | **2 display bugs fixed** |
| Gamification | Are badges and levels reachable, and by whom? | All reachable; Silver/Gold too easy; Diamond only for heavy users | none (design findings) |

## 2. Fraud detection (Isolation Forest)

**Question:** does the per-cardholder Isolation Forest flag injected anomalies,
and does it beat the hand-written rule set the app uses before a cardholder has
history?

**Method:** each run builds a cardholder with 180 days of habitual spending
(about 270 purchases) and injects anomalies of five kinds a cardholder would
query on their own statement: an extreme amount, an hour they never transact,
an unknown merchant, a burst of charges minutes apart (card-testing), and a
category they have never used. The fraud rate is about 3.6%, deliberately
modest because precision depends on the base rate. Every transaction is scored
by the model and by the rule baseline. Repeated on 30 held-out seeds
(`evaluation/robustness.py`).

### 2.1 The weakness and the change

On the first evaluation the detector (v2) caught unusual-hour purchases only
**40%** of the time. These are a normal amount, at a familiar shop, at an hour
the cardholder never uses. The validation data showed why: they scored a median
of 58.5, just under the alert threshold of 60. Their hour-rarity feature (0.94)
was far outside anything in normal spending (maximum 0.52), but the forest
averages over six features, and only one of them was unusual.

Two changes were tested on validation seeds 201–230:

| Validation (30 seeds) | F1 | Unusual-hour recall | False alarms |
|---|---|---|---|
| v2: threshold 60 | 0.824 | 0.45 | 0.62% |
| Threshold 56 (best F1 with ≤1% false alarms) | 0.849 | 0.65 | 0.81% |
| **Threshold 56 + never-seen-hour check (v3)** | **0.874** | **0.88** | **0.81%** |
| Threshold 56 + the same check on 4 features | 0.826 | 0.88 | 1.30% |

The never-seen-hour check flags a purchase whose hour rarity exceeds everything
in the cardholder's own training history by more than 0.1. Extending it to
amount and timing features caught nothing extra and pushed false alarms past the
1% limit, so it is hour-only. Detector v3 keeps the model's scoring scale
unchanged (anchored at 60) and moves only the alert line to 56.

### 2.2 Held-out results (seeds 301–330)

| Metric | v3 (shipped) | v2 (previous) | v3 − v2 (paired) | Rule baseline |
|---|---|---|---|---|
| Precision | 0.830 [0.798, 0.864] | 0.856 [0.821, 0.891] | −0.026 [−0.046, −0.006] | 0.875 [0.814, 0.933] |
| Recall | 0.963 [0.933, 0.987] | 0.830 [0.790, 0.867] | **+0.133 [+0.107, +0.157]** | 0.203 [0.193, 0.213] |
| F1 | **0.887 [0.864, 0.908]** | 0.839 [0.807, 0.868] | **+0.048 [+0.029, +0.068]** | 0.326 [0.311, 0.342] |
| False-positive rate | 0.84% [0.65, 1.03] | 0.57% [0.43, 0.72] | +0.26 pts [0.15, 0.37] | 0.15% |
| Unusual-hour recall | 0.97 | 0.40 [0.27, 0.53] | **+0.57 [+0.43, +0.70]** | — |
| Average precision | 0.919 [0.890, 0.946] | — | — | 0.529 [0.510, 0.549] |

The change is kept: F1 rises clearly, and false alarms stay under the 1% limit
set in advance. The cost is a small drop in precision, about one extra false
alarm per 380 purchases, which should be stated wherever the gain is. v3 beat the
rule baseline on F1 in **30 of 30** seeds (+0.561 [0.533, 0.587]). Its higher
precision against the baseline is not significant: the gain over the rules is
almost entirely recall.

Recall by anomaly kind (pooled over the 30 held-out seeds):

| Kind | Detected | Recall |
|---|---|---|
| Unknown merchant | 60/60 | 1.00 |
| Never-used category | 30/30 | 1.00 |
| Extreme amount | 58/60 | 0.97 |
| Unusual hour | 58/60 | 0.97 (was 0.40) |
| Rapid burst (card testing) | 83/90 | 0.92 |

**Latency** (scoring on the request path): about 6–23 ms per transaction with a
cached model, and 180–560 ms when the model is refitted (once every 25
purchases), for histories of 135–687 transactions. Timings vary by ±50%
between runs with machine load. In alternating runs on the same machine, v2
and v3 were indistinguishable: the hour check adds one comparison.

**Limitations:** the anomalies are synthetic and non-adversarial, so a real
fraudster who imitates the cardholder's habits would not look like these. The
results show the detector separates the departures it was designed around; they
are not a claim about real-world fraud rates. The hour check also assumes a
cardholder's waking hours are stable; a shift worker changing rota would trigger
it until the model is refitted (every 25 purchases).

## 3. Earnings forecast

**Question:** does the 30-day earnings forecast beat simply assuming the next 30
days will match the last 30, and is the range it shows honest?

**Method:** rolling-origin backtest. The model is fitted on history up to a
cut-off (`as_of`), predicts the next 30 days, and is scored against what
happened; the cut-off then advances (8 folds per cardholder). Three spending
regimes are tested, because a forecast can only be judged fairly against all
three: stationary, growing (+80% over the period) and declining (−50%). Skill =
naive error ÷ model error, so above 1 means the model is better.

### 3.1 Accuracy (held-out seeds 301–330)

| Regime | Model MAPE | Naive MAPE | Skill [95% CI] | Seeds where model wins |
|---|---|---|---|---|
| Stationary | 16.9% | 19.5% | **1.153 [1.093, 1.215]** | 22/30 |
| Growing | 16.3% | 18.8% | **1.159 [1.090, 1.229]** | 24/30 |
| Declining | 23.7% | 23.2% | 0.994 [0.934, 1.055] | 14/30 |

The forecast is reliably better than the naive baseline when spending is steady
or rising, and no better when it is falling. The model's design came from an
earlier round of this evaluation: a Holt trend model lost to the naive baseline,
so the trend term was removed and the shipped model blends level smoothing with
the window mean (see `app/ml_forecast.py`).

### 3.2 Negative result: the declining case

Weighting level smoothing more heavily should help on declining spending, where
a window mean lags. On validation data, every variant was within 0.1 MAPE points
of the shipped 50/50 blend overall, and each one that helped declining series
hurt steady ones:

| Validation MAPE % | Steady | Growing | Declining | All |
|---|---|---|---|---|
| Shipped (50/50) | 14.36 | 15.35 | 20.30 | 16.67 |
| 70% level smoothing | 14.85 | 15.46 | 19.42 | 16.58 |
| 80% level when labelled "decreasing" | 14.44 | 15.35 | 20.01 | 16.60 |

The cause is in the data: within the model's 13-week window the simulated
decline is gentle enough to look like noise (only 21 of 240 declining folds were
even labelled "decreasing"). **No change was made.** The limitation stands:
for a cardholder whose spending is falling, the forecast is no better than
repeating last month.

### 3.3 The range shown with the forecast

The app showed a fixed ±10–20% around the forecast, whatever the cardholder's
history. It contained the actual outcome in only 54–69% of backtest folds, too
narrow to mean anything specific.

**Change made:** the range is now an **80% prediction interval** built from the
cardholder's own week-to-week variability. It adds two independent sources of
error: the next weeks' own variation (weeks × s²), and the error in the
estimated weekly mean they are projected from (weeks² × s² / n). A single
scale factor (1.18) for what that formula leaves out was fitted on validation
backtests to reach 80% coverage there.

| Coverage | Old range ±10–20% (first evaluation, seeds 1–30) | New 80% interval (held-out, seeds 301–330) |
|---|---|---|
| Stationary | 69% | **82%** [77, 86] |
| Growing | 54% | 70% [63, 76] |
| Declining | 59% | 74% [69, 79] |
| Mean relative width | 20–40% | about 54% (±27%) |

The new interval is honest for steady spenders and much closer to its stated
level overall (75% vs 80% target). It still undercovers growing spending,
because the forecast deliberately has no trend term. The honest trade-off is
width: a wider range that means what it says, instead of a narrow one that
didn't.

## 4. Boost recommender (rule engine)

**Question:** a boost doubles cashback in one category for 30 days. Does the
recommender pick the category where the boost will pay the most?

**Method:** in hindsight the right boost is known: the category with the most
`spend × base rate` over the 30 days after the decision (the **oracle**). The
recommender sees the 60 days before the decision (`as_of`) and is scored on:

- **hit rate:** the share of decisions where its pick matched the oracle's;
- **value captured:** the share of the oracle's extra sats its pick would have
  earned. A near-miss still captures most of the value.

Three populations of 200 cardholders each: **stable** habits; **drifting**
(the category mix moves gradually towards a new one); and **emerging** (one
minor or unused category grows to 40% of spend, like a new hobby). The trend and
recency factors exist for the last two.

**First result (v1).** The shipped recommender was a weighted sum of five
normalised factors (volume 0.30, frequency 0.25, base rate 0.15, trend 0.15,
recency 0.15). On a validation population it lost to the simplest rule here:
boost whatever earned the most in the last 60 days, which is exactly the
quantity a boost multiplies. Removing each factor in turn showed why:

| v1 variant (held-out test) | Hit rate | Change vs v1 |
|---|---|---|
| v1 as shipped | 0.607 | — |
| without trend | 0.607 | 0.000 |
| without recency | 0.610 | +0.003 |
| without frequency | 0.668 | **+0.061** |
| without base rate | 0.558 | −0.049 |
| without spend volume | 0.443 | −0.164 |

Trend and recency contributed nothing, and frequency made v1 *worse*. More
fundamentally, adding volume and rate cannot express that a boost is worth their
**product**.

**Change made:** the app now ranks categories by expected boost value
(spend × rate over the last 60 days). The explanation shown in the app still
uses the factors.

**Result on the held-out test population** (600 cardholders, a seed not used to
make the decision):

| Method | Hit rate | Value captured |
|---|---|---|
| **Shipped (expected value)** | **0.700 [0.663, 0.737]** | **0.859 [0.838, 0.879]** |
| v1 weighted score | 0.607 [0.567, 0.643] | 0.799 [0.774, 0.822] |
| Highest spend (ignores rate) | 0.640 [0.600, 0.678] | 0.820 [0.796, 0.842] |
| Most frequent category | 0.378 [0.338, 0.417] | 0.594 [0.563, 0.624] |
| Random used category | 0.191 [0.188, 0.195] | 0.380 [0.371, 0.391] |
| Last 30 days only | 0.715 [0.682, 0.750] | 0.869 [0.849, 0.887] |
| Recency-weighted, half-life 10 days | 0.720 [0.685, 0.757] | 0.874 [0.855, 0.894] |

Shipped minus v1, paired on the same cardholders: **hit rate +9.3 points
[5.7, 13.2]**, **value captured +6.0 points [3.5, 8.5]**. The improvement holds
in every population (stable 0.825 vs 0.740, drifting 0.645 vs 0.535, emerging
0.630 vs 0.545), and the oracle's category is in the shipped top three for
91–99% of cardholders.

Recency-weighted variants scored 1–2 points higher on the test population, but
within noise, and lower on the validation population. Reporting them is the
honest picture: a modest recency weighting may help, but these data cannot
show it.

**Limitations:** spending is generated; a cardholder who changes behaviour
*because* of a boost is not modelled; and the oracle ignores the level
multiplier, which scales every category equally and so does not change the
ranking.

## 5. Spending persona (rule engine)

**Question:** is the persona correct, how much spending does it need, and is the
confidence shown to the user honest?

**Method:** each simulated cardholder's true spending mix is drawn from a
Dirichlet distribution centred on one persona's profile, with four levels of
typicality (concentration 200 "textbook", 50, 20, 8 "atypical"). Purchases are
drawn from that mix, and the classifier sees only those purchases after 5, 10,
20, 50 and 100 of them. 200 cardholders per persona per typicality level (4,000
in total, held-out seed 330). Classifying the cardholder's *true* mix gives a
**ceiling**: errors below the ceiling come from too few purchases; errors at the
ceiling come from cardholders who genuinely sit between personas.

| Typicality | Ceiling | n=5 | n=10 | n=20 | n=50 | n=100 |
|---|---|---|---|---|---|---|
| Textbook | 1.000 | 0.588 | 0.698 | 0.804 | 0.934 | 0.989 |
| Typical | 0.997 | 0.602 | 0.694 | 0.777 | 0.898 | 0.963 |
| Loose | 0.951 | 0.578 | 0.645 | 0.736 | 0.837 | 0.904 |
| Atypical | 0.834 | 0.572 | 0.657 | 0.704 | 0.778 | 0.790 |

(Chance is 0.20; ±0.03 at 95% for each cell.)

The classifier itself is sound: on the true mix it is essentially always right
for typical cardholders. Its errors come from estimating the mix from a small
sample.

**Calibration** (does "80% confidence" mean right 80% of the time?), as
expected calibration error (ECE; Guo et al., 2017), where 0 is perfect:

| Purchases seen | Mean confidence | Accuracy | ECE |
|---|---|---|---|
| 5 | 0.658 | 0.585 | **0.078** |
| 10 | 0.720 | 0.674 | 0.058 |
| 20 | 0.774 | 0.755 | **0.040** |
| 50 | 0.830 | 0.862 | 0.034 |
| 100 | 0.861 | 0.912 | 0.054 |

### 5.1 Change 1: unlock after 20 purchases, not 5

The app showed the persona after 5 purchases. On the first evaluation (seed 23)
it was right only 55–57% of the time there while claiming 66% confidence
(ECE 0.10). The threshold is now **20** (`app/spending_persona.py`), the point
where accuracy reaches 70–80% and confidence is honest. This was read directly
off the accuracy table rather than tuned, and the held-out figures above agree.

### 5.2 Change 2: Balanced wins near-ties

Balanced was the weak persona: recognised only about 40% of the time, because a
few dozen purchases from an even spender are lumpy and sit slightly closer to
some specific persona by chance. The fix prefers Balanced when its similarity is
within a margin of the best specific persona. The margin, 0.05, was chosen on
validation seed 230 as the one maximising overall accuracy, so gains on Balanced
could not come at the other personas' expense.

| Recall after 20 purchases (held-out) | Without margin | With margin (shipped) |
|---|---|---|
| Foodie | 0.841 | 0.833 |
| Traveler | 0.738 | 0.716 |
| Entertainer | 0.820 | 0.800 |
| Planner | 0.904 | 0.858 |
| **Balanced** | **0.395** | **0.570** |
| **Overall (paired)** | — | **+1.6 points [0.8, 2.3]** |

The other personas give up 1–5 points each; overall accuracy rises.

**Limitations:** the personas' profiles are design choices, not clusters found
in real data, so accuracy here means "consistent with the defined personas", not
"psychologically correct".

## 6. Reward engine (rule engine)

**Question:** does the cashback arithmetic hold for every purchase?

**Method:** property checks on 200,000 random purchases spanning $0.01 to the
$1,000,000 cap (log-uniform), bitcoin at $10k–$500k, every category rate, level
multiplier and boost. "Exact" is computed independently with 50-digit decimal
arithmetic. A property that holds on every purchase is strong evidence; a single
counterexample is a bug.

| Property | Violations now | Before fix |
|---|---|---|
| Breakdown parts sum to the total | 0 | 0 |
| No negative part in the breakdown | 0 | **8,530 (4.3%)** |
| No "boost bonus" when no boost is active | 0 | **18,060 (18% of no-boost purchases)** |
| No "level bonus" at base level | 0 | 0 |
| Total within ½ sat of exact | 0 (max error 0.499996) | — |
| More spend never earns fewer sats (50,000 pairs) | 0 | — |
| Higher bitcoin price never earns more sats | 0 | — |
| Higher level never earns fewer sats | 0 | — |
| Level boundaries and progress in [0, 1] | 0 | — |
| Round-up spare change matches exact cents (50,000) | 0 | **3,217 (6.4%)** |

**Two bugs found and fixed:**

1. **Phantom boost line on receipts.** The breakdown rounded each part
   separately, so the rounding error landed on whichever part was computed last.
   The purchase screen then showed "+1 sat boost" for a boost the user did not
   have, and sometimes a negative part. The fix rounds the running totals and
   takes differences, which is exact by construction.
2. **Wrong cent in round-up.** $0.39 of spare change × 1.5 = $0.585 was shown as
   $0.58, because 0.585 is stored as 0.58499… in floating point. The fix works in
   whole cents with decimal arithmetic, rounding half up.

In both cases the sats actually paid were already correct; only what the user
was shown was wrong.

**Rounding to whole sats** costs a negligible share of the reward on realistic
purchases (mean 0.02% for $10–100, 0.0007% from $100), but a large share below
$1 (mean 16%). At $60,000 per bitcoin the smallest purchase earning a whole sat
is $0.02–$0.04 depending on the rate.

## 7. Gamification (rule engine)

**Question:** gamification only motivates when goals sit at the right distance.
Are the badges and levels reachable, and by whom?

**Method:** no ground truth exists for "the right difficulty", so the suite
measures **attainment**. 40 simulated cardholders at each of three activity
levels spend for 180 days through the app's real streak and badge code (only the
clock is simulated):

- **light:** spends on 30% of days, one purchase;
- **regular:** spends on 70% of days, one or two purchases;
- **heavy:** spends on 90% of days, two to four purchases.

Share earning each badge by day 180:

| Badge | Light | Regular | Heavy |
|---|---|---|---|
| First swipe | 1.00 | 1.00 | 1.00 |
| Mountain climber (10k sats) | 1.00 | 1.00 | 1.00 |
| Precision spender | 1.00 | 1.00 | 1.00 |
| Whale alert (100k sats) | 0.65 | 1.00 | 1.00 |
| Night owl | 0.65 | 0.95 | 1.00 |
| Category explorer | 0.55 | 0.72 | 0.90 |
| Streak master (7 days) | **0.00** | 1.00 | 1.00 |
| Centurion (100 purchases) | **0.00** | 1.00 | 1.00 |
| Lightning fast (3 in a day) | **0.00** | 0.00 | 1.00 |
| Diamond hands | 0.00 | 0.03 | 0.60 |

Median day each level is reached:

| Level | Light | Regular | Heavy |
|---|---|---|---|
| Silver | 15 | 7 | 2 |
| Gold | 64 | 28 | 9 |
| Platinum | 108 (30% reach it) | 74 | 32 |
| Diamond | never | 156 (3%) | 96 (60%) |

**Findings for the design:**

- **Silver and Gold are too easy:** every cardholder reaches both, heavy users
  within nine days, so they barely work as goals. Raising them, or adding a level
  between Gold and Platinum, would spread progress more evenly.
- **Diamond is effectively a heavy-user goal:** 60% of heavy users reach it
  within 180 days, 3% of regular users and no light users.
- **Some badges are out of reach for light users at their pace:** Streak master
  (longest streak at most 6 days), Centurion and Lightning fast. Lightning fast is
  also unreachable for regular users, but only because their definition caps them
  at two purchases a day, an artefact of the simulation rather than a finding.
- **No badge is unreachable for everyone,** and only First swipe is earned by
  more than 80% of users in the first week, which suits a welcome badge.
- Levels are measured in sats, so they get **harder as the bitcoin price
  rises**. The simulation uses $60,000 per bitcoin; at $81,000 the same spending
  earns 26% fewer sats. Thresholds in dollars of reward would keep difficulty
  stable.

No thresholds were changed: difficulty is a design decision without a right
answer to measure against, and these results are the evidence for that decision.

## 8. Threats to validity

- **Synthetic data:** every result is against generated behaviour. The
  generators were written to be plausible and deliberately naive about the
  models, but real cardholders and real fraud will differ.
- **Generator choices shape results:** for example, the share of each fraud kind,
  the drift strength in the recommender populations, and the activity definitions
  in the gamification simulation. Each module documents its choices.
- **Changes motivated by the evaluation:** every tuned value (fraud threshold,
  interval scale, Balanced margin, boost ranking) was chosen on validation seeds
  and reported on held-out seeds; the persona unlock threshold was read directly
  off the accuracy table. The seed table in section 1.2 makes this auditable.
- **Held-out is not real-world:** a held-out seed is a fresh draw from the same
  generator, so it guards against overfitting to one draw, not against the
  generator itself being unrealistic.
- **No user study:** whether these components *motivate* anyone is a question
  for the survey and usability testing, not for this harness.

## 9. Reproducing

```bash
pip install -r requirements.txt
python -m evaluation.run                    # all suites, about 10 minutes
python -m evaluation.run --only persona     # one suite (updates results.json)
pytest tests/test_evaluation.py             # the harness's own tests
```

## References

- Efron, B. and Tibshirani, R. J. (1993). *An Introduction to the Bootstrap*.
  Chapman & Hall.
- Guo, C., Pleiss, G., Sun, Y. and Weinberger, K. Q. (2017). On calibration of
  modern neural networks. *Proceedings of ICML 2017*.
- Liu, F. T., Ting, K. M. and Zhou, Z.-H. (2008). Isolation Forest.
  *Proceedings of IEEE ICDM 2008*.
- Hyndman, R. J. and Athanasopoulos, G. *Forecasting: Principles and Practice*
  (3rd ed.). OTexts.
- Tashman, L. J. (2000). Out-of-sample tests of forecasting accuracy: an analysis
  and review. *International Journal of Forecasting*, 16(4).

Check every reference against the original before citing it.
