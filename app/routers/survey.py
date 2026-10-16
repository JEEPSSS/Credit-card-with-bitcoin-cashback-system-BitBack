"""Chapter 3.6's usability-validation survey.

Public and unauthenticated on purpose: a respondent should not have to
register a BitBack account to tell us whether the product idea works, and
recruitment (Chapter 3.6's sampling plan) happens over university mailing
lists and social channels where most links get one anonymous tap.

Two delivery channels write to the same table (`source` distinguishes them):
the standalone web page mounted at GET /survey, and the in-app screen in the
mobile client. Fielding this for real additionally requires the backend to be
reachable from outside the development machine — see Chapter 4.6 and
Chapter 7.3, which already document that neither half of the system has been
deployed anywhere public.
"""
import statistics

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SurveyResponse
from app.rate_limit import client_ip, rate_limit
from app.schemas import SurveyResponseCreate, SurveyResponseOut, SurveySummary

router = APIRouter(prefix="/api/survey", tags=["survey"])

# Concept items: answerable by anyone who understands the pitch, used or not.
CONCEPT_LIKERT_FIELDS = ["q1", "q2", "q3"]
# App-experience items: presuppose specific screens (reward preview, forecast,
# fraud-flagging view) that only a respondent who has used the prototype has
# actually seen -- see the has_used_app docstring on the model.
APP_EXPERIENCE_FIELDS = ["q4", "q5", "q6", "q7"]
LIKERT_FIELDS = CONCEPT_LIKERT_FIELDS + APP_EXPERIENCE_FIELDS
SUBMISSIONS_PER_ADDRESS_PER_HOUR = 60
Q8_OPTIONS = ["much_less", "less", "equally", "more", "much_more"]


@router.post("/responses", response_model=SurveyResponseOut)
def submit_response(body: SurveyResponseCreate, request: Request, db: Session = Depends(get_db)):
    # A ceiling that stops a scripted flood, not a genuine respondent, who
    # submits once. It is per address, and a campus or office network puts
    # hundreds of people behind one NAT address - the original 5/hour would
    # have turned away the sixth respondent in a lecture theatre.
    rate_limit(f"survey:{client_ip(request)}", SUBMISSIONS_PER_ADDRESS_PER_HOUR, window=3600)

    used_app = bool(body.has_used_app)
    if not body.screen_active_trader:
        # Chapter 3.1 defines the target user as crypto-curious, not
        # crypto-active; Chapter 3.6's sampling plan screens active traders
        # out before the substantive questions, so a real answer set is
        # required here. Q4-Q7 are only required when the respondent has
        # actually used the app -- see APP_EXPERIENCE_FIELDS above.
        missing = [f for f in CONCEPT_LIKERT_FIELDS if getattr(body, f) is None]
        if body.q8 is None:
            missing.append("q8")
        if body.has_used_app is None:
            missing.append("has_used_app")
        elif used_app:
            missing += [f for f in APP_EXPERIENCE_FIELDS if getattr(body, f) is None]
        if missing:
            raise HTTPException(400, f"Missing required answers: {', '.join(missing)}")

    # Q4-Q7 are dropped (not merely left unrequired) for anyone who hasn't
    # used the app, same as every field is dropped for a screened-out row --
    # storing an answer to a question the respondent had no grounded basis
    # to answer would misrepresent what was actually measured.
    skip_app_items = body.screen_active_trader or not used_app
    row = SurveyResponse(
        source=body.source,
        screened_out=body.screen_active_trader,
        has_used_app=None if body.screen_active_trader else used_app,
        q1=None if body.screen_active_trader else body.q1,
        q2=None if body.screen_active_trader else body.q2,
        q3=None if body.screen_active_trader else body.q3,
        q4=None if skip_app_items else body.q4,
        q5=None if skip_app_items else body.q5,
        q6=None if skip_app_items else body.q6,
        q7=None if skip_app_items else body.q7,
        q8=None if body.screen_active_trader else body.q8,
        q9=None if body.screen_active_trader else body.q9,
        q10=None if body.screen_active_trader else body.q10,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SurveyResponseOut(id=row.id, screened_out=row.screened_out)


def cohort(r: SurveyResponse) -> str:
    """Which analysis group a response belongs to.

    `legacy` is a response stored before the has_used_app question existed
    (migration c4e2a1f6b8d3). Back then Q4-Q7 were required of everyone, so
    those answers may come from people who never saw the screens they ask
    about. They are kept, and reported separately - never pooled with
    `used_app` and never deleted.
    """
    if r.screened_out:
        return "screened_out"
    if r.has_used_app is None:
        return "legacy"
    return "used_app" if r.has_used_app else "concept_only"


def likert_stats(values: list[int]) -> dict:
    """Median and interquartile range lead; the mean is kept for comparison.

    Likert responses are ordinal: the distance from "disagree" to "neutral"
    is not known to equal the distance from "neutral" to "agree", so a mean
    assumes an interval scale the instrument does not have. The full
    distribution is included so a chart never has to be reverse-engineered
    from summary numbers.
    """
    if not values:
        return {"n": 0, "median": None, "q1": None, "q3": None, "mean": None,
                "distribution": {str(k): 0 for k in range(1, 6)}}
    if len(values) == 1:
        q1 = q3 = float(values[0])
    else:
        q1, _, q3 = statistics.quantiles(values, n=4, method="inclusive")
    return {
        "n": len(values),
        "median": float(statistics.median(values)),
        "q1": round(q1, 2), "q3": round(q3, 2),
        "mean": round(statistics.mean(values), 2),
        "distribution": {str(k): values.count(k) for k in range(1, 6)},
    }


@router.get("/summary", response_model=SurveySummary)
def summary(db: Session = Depends(get_db)):
    """Aggregate only — never returns Q9/Q10 free text, which respondents did
    not consent to having published live.

    Concept items (Q1-Q3) are analysed over every included respondent,
    legacy rows among them: that question was asked of everyone, before and
    after the migration. App items (Q4-Q7) are analysed over `used_app`
    respondents only. They used to include legacy rows' answers while
    `used_app_count` excluded those rows, so the reported means and the
    reported n described different groups of people.
    """
    rows = db.query(SurveyResponse).all()
    groups: dict[str, list[SurveyResponse]] = {
        "screened_out": [], "legacy": [], "used_app": [], "concept_only": []}
    for r in rows:
        groups[cohort(r)].append(r)
    included = groups["legacy"] + groups["used_app"] + groups["concept_only"]

    by_source: dict[str, int] = {}
    for r in rows:
        by_source[r.source] = by_source.get(r.source, 0) + 1

    def values(group: list[SurveyResponse], field: str) -> list[int]:
        return [getattr(r, field) for r in group if getattr(r, field) is not None]

    likert = {f: likert_stats(values(included, f)) for f in CONCEPT_LIKERT_FIELDS}
    likert |= {f: likert_stats(values(groups["used_app"], f)) for f in APP_EXPERIENCE_FIELDS}

    q8_distribution = {opt: 0 for opt in Q8_OPTIONS}
    for r in included:
        if r.q8 in q8_distribution:
            q8_distribution[r.q8] += 1

    return SurveySummary(
        total_responses=len(rows),
        screened_out=len(groups["screened_out"]),
        included=len(included),
        used_app_count=len(groups["used_app"]),
        legacy_count=len(groups["legacy"]),
        by_source=by_source,
        likert=likert,
        likert_means={f: stats["mean"] for f, stats in likert.items()},
        legacy_app_items={f: likert_stats(values(groups["legacy"], f))
                          for f in APP_EXPERIENCE_FIELDS},
        q8_distribution=q8_distribution,
    )
