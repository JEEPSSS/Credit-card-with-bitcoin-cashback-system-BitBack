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
  maths, badge SQL and classifier), not re-implementations. The two exceptions
  are retired versions (`v1_rank`, `v1_breakdown`, `v1_round_up_usd`), kept so
  before/after comparisons run on the same inputs. A test pins `v1_rank` to the
  original code's exact output.
- **Uncertainty:** headline numbers are reported as a mean with a 95% percentile
  bootstrap confidence interval (Efron & Tibshirani, 1993). Comparisons between
  two methods are **paired**, computed on the same cardholders, which removes
  between-cardholder variation from the comparison.
- **No tuning on the test data:** where the evaluation led to a design change,
  the change was chosen on a validation population (one seed) and reported on a
  separate held-out population (another seed).
- **Checking that a test can fail:** each regression test was run against the
  code before its fix to confirm it fails there.

### 1.3 Summary

| Component | Question | Result | Change made |
|---|---|---|---|
| Fraud detection (Isolation Forest) | Does it catch injected anomalies without flagging normal spending? | F1 0.84 [0.81, 0.88], 0.6% false positives; beats the rule baseline on 30/30 seeds | none |
| Earnings forecast | Does it beat "next month = last month"? | Yes for stable and growing spending; no for declining | none (limit documented) |
| Boost recommender | Does it pick the category whose boost pays most? | v1 lost to a simple rule; the new ranking picks the best category 70.0% vs 60.7% (+9.3 pts [5.7, 13.2]) | **ranking replaced** |
| Spending persona | Is the persona right, and is its confidence honest? | After 5 purchases: 56% right, overconfident (ECE 0.10). After 20: 75%, calibrated (ECE 0.03) | **unlock threshold 5 → 20** |
| Reward engine | Does the arithmetic hold for every purchase? | 2 display bugs found in 200,000 purchases, both fixed; totals exact to ±0.5 sat | **2 bugs fixed** |
| Gamification | Are badges and levels reachable, and by whom? | All reachable; Silver/Gold too easy; Diamond reached only by heavy users | none (design findings) |

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
by the model and by the rule baseline at the app's threshold of 60. This was
repeated on **30 independent seeds** (`evaluation/robustness.py`).

| Metric (30 seeds) | Isolation Forest | Rule baseline | Difference (paired) |
|---|---|---|---|
| Precision | 0.861 [0.822, 0.899] | 0.798 [0.711, 0.878] | +0.063 [−0.009, +0.136] |
| Recall | 0.840 [0.797, 0.880] | 0.187 [0.170, 0.203] | **+0.653 [0.610, 0.690]** |
| F1 | 0.844 [0.807, 0.876] | 0.297 [0.272, 0.324] | **+0.547 [0.513, 0.576]** |
| False-positive rate | 0.0058 [0.0041, 0.0076] | 0.0025 [0.0014, 0.0037] | +0.0033 |
| Average precision | 0.928 [0.899, 0.954] | 0.536 [0.507, 0.566] | **+0.392 [0.358, 0.425]** |

The model beat the baseline on F1 in **30 of 30** seeds. The precision
difference is not significant (its interval includes zero): the model's gain is
in recall. It catches about four times as much of the injected fraud at a
similar precision. A false-positive rate of 0.6% means roughly one
unnecessary alert per 170 purchases.

Recall by anomaly kind (pooled over 30 seeds):

| Kind | Detected | Recall |
|---|---|---|
| Unknown merchant | 60/60 | 1.00 |
| Never-used category | 30/30 | 1.00 |
| Extreme amount | 57/60 | 0.95 |
| Rapid burst (card testing) | 81/90 | 0.90 |
| Unusual hour | 24/60 | **0.40** |

**Weak spot:** a normal-sized purchase at an unusual hour is caught only 40% of
the time. Hour is one feature among six, so on its own it rarely pushes the
score past the threshold. This is the clearest target for future work, for
example a per-cardholder hour model or a lower threshold for that feature
combination.

**Latency** (scoring on the request path): 4.5–10.7 ms per transaction with a
cached model, and 129–302 ms when the model is refitted (once every 25
purchases), for histories of 135–687 transactions.

**Limitations:** the anomalies are synthetic and non-adversarial, so a real
fraudster who imitates the cardholder's habits would not look like these. The
results show the detector separates the departures it was designed around; they
are not a claim about real-world fraud rates.

## 3. Earnings forecast

**Question:** does the 30-day earnings forecast beat simply assuming the next 30
days will match the last 30?

**Method:** rolling-origin backtest. The model is fitted on history up to a
cut-off (`as_of`), predicts the next 30 days, and is scored against what
happened; the cut-off then advances (8 folds per cardholder). Three spending
regimes are tested, because a forecast can only be judged fairly against all
three: stationary, growing (+80% over the period) and declining (−50%). Repeated
on 30 seeds. Skill = naive error ÷ model error, so above 1 means the model is
better.

| Regime | Model MAPE | Naive MAPE | Skill [95% CI] | Seeds where model wins |
|---|---|---|---|---|
| Stationary | 16.6% | 18.2% | **1.115 [1.048, 1.173]** | 21/30 |
| Growing | 17.3% | 18.2% | **1.059 [1.004, 1.112]** | 21/30 |
| Declining | 22.5% | 21.7% | 0.968 [0.914, 1.022] | 12/30 |

The forecast is reliably better than the naive baseline when spending is steady
or rising, and no better (the interval spans 1) when it is falling. The range
shown in the app (low–high) contained the actual outcome in only 54–69% of
folds, so the report should describe it as an **indicative range, not a
calibrated prediction interval**.

The model's design came from an earlier round of this evaluation: a Holt trend
model lost to the naive baseline, so the trend term was removed and the shipped
model blends level smoothing with the window mean (see `app/ml_forecast.py`).

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
in total). Classifying the cardholder's *true* mix gives a **ceiling**: errors
below the ceiling come from too few purchases; errors at the ceiling come from
cardholders who genuinely sit between personas.

| Typicality | Ceiling | n=5 | n=10 | n=20 | n=50 | n=100 |
|---|---|---|---|---|---|---|
| Textbook | 1.000 | 0.545 | 0.675 | 0.795 | 0.941 | 0.983 |
| Typical | 0.999 | 0.575 | 0.650 | 0.768 | 0.901 | 0.951 |
| Loose | 0.948 | 0.570 | 0.656 | 0.745 | 0.837 | 0.890 |
| Atypical | 0.801 | 0.552 | 0.625 | 0.693 | 0.750 | 0.776 |

(Chance is 0.20; ±0.03 at 95% for each cell.)

The classifier itself is sound: on the true mix it is essentially always right
for typical cardholders. Its errors come from estimating the mix from a small
sample.

**Calibration** (does "80% confidence" mean right 80% of the time?), as
expected calibration error (ECE; Guo et al., 2017), where 0 is perfect:

| Purchases seen | Mean confidence | Accuracy | ECE |
|---|---|---|---|
| 5 | 0.663 | 0.560 | **0.104** |
| 10 | 0.723 | 0.651 | 0.073 |
| 20 | 0.779 | 0.750 | **0.029** |
| 50 | 0.835 | 0.857 | 0.036 |
| 100 | 0.865 | 0.900 | 0.046 |

**Change made:** the app showed the persona after 5 purchases, where it was
right barely more than half the time while claiming two-thirds confidence. The
threshold is now **20** (`app/spending_persona.py`), the point where accuracy
reaches 69–80% and confidence becomes honest.

Recall by persona after 20 purchases: Planner 0.92, Entertainer 0.84, Foodie
0.84, Traveler 0.73, **Balanced 0.42**. Balanced is the hardest because a
handful of purchases from an even spender looks lumpy and resembles a specific
persona. A future version could require a larger margin before assigning a
specific persona over Balanced.

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
- **Changes motivated by the evaluation:** the boost ranking was chosen on one
  population and confirmed on another; the persona threshold was read directly
  off the accuracy table rather than tuned. Both are stated, so a reader can
  weigh them.
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
