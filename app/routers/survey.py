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

LIKERT_FIELDS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"]
Q8_OPTIONS = ["much_less", "less", "equally", "more", "much_more"]


@router.post("/responses", response_model=SurveyResponseOut)
def submit_response(body: SurveyResponseCreate, request: Request, db: Session = Depends(get_db)):
    # A generous but real ceiling: this stops a scripted flood, not a genuine
    # respondent, who submits once.
    rate_limit(f"survey:{client_ip(request)}", 5, window=3600)

    if not body.screen_active_trader:
        # Chapter 3.1 defines the target user as crypto-curious, not
        # crypto-active; Chapter 3.6's sampling plan screens active traders
        # out before the substantive questions, so a real answer set is
        # required here.
        missing = [f for f in LIKERT_FIELDS if getattr(body, f) is None] + (["q8"] if body.q8 is None else [])
        if missing:
            raise HTTPException(400, f"Missing required answers: {', '.join(missing)}")

    row = SurveyResponse(
        source=body.source,
        screened_out=body.screen_active_trader,
        q1=None if body.screen_active_trader else body.q1,
        q2=None if body.screen_active_trader else body.q2,
        q3=None if body.screen_active_trader else body.q3,
        q4=None if body.screen_active_trader else body.q4,
        q5=None if body.screen_active_trader else body.q5,
        q6=None if body.screen_active_trader else body.q6,
        q7=None if body.screen_active_trader else body.q7,
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

    by_source: dict[str, int] = {}
    for r in rows:
        by_source[r.source] = by_source.get(r.source, 0) + 1

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
        by_source=by_source,
        likert_means=likert_means,
        q8_distribution=q8_distribution,
    )
