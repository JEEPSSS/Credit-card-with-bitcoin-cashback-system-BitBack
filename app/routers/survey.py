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
Q8_OPTIONS = ["much_less", "less", "equally", "more", "much_more"]


@router.post("/responses", response_model=SurveyResponseOut)
def submit_response(body: SurveyResponseCreate, request: Request, db: Session = Depends(get_db)):
    # A generous but real ceiling: this stops a scripted flood, not a genuine
    # respondent, who submits once.
    rate_limit(f"survey:{client_ip(request)}", 5, window=3600)

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


@router.get("/summary", response_model=SurveySummary)
def summary(db: Session = Depends(get_db)):
    """Aggregate only — never returns Q9/Q10 free text, which respondents did
    not consent to having published live."""
    rows = db.query(SurveyResponse).all()
    included = [r for r in rows if not r.screened_out]
    used_app_count = sum(1 for r in included if r.has_used_app)

    by_source: dict[str, int] = {}
    for r in rows:
        by_source[r.source] = by_source.get(r.source, 0) + 1

    # q1-q3's denominator is every included respondent; q4-q7's is only
    # used_app_count of them -- getattr(...) is None already excludes the
    # nulled-out non-users, so this falls out without a separate branch.
    likert_means: dict[str, float | None] = {}
    for f in LIKERT_FIELDS:
        values = [getattr(r, f) for r in included if getattr(r, f) is not None]
        likert_means[f] = round(statistics.mean(values), 2) if values else None

    q8_distribution = {opt: 0 for opt in Q8_OPTIONS}
    for r in included:
        if r.q8 in q8_distribution:
            q8_distribution[r.q8] += 1

    return SurveySummary(
        total_responses=len(rows),
        screened_out=len(rows) - len(included),
        included=len(included),
        used_app_count=used_app_count,
        by_source=by_source,
        likert_means=likert_means,
        q8_distribution=q8_distribution,
    )
