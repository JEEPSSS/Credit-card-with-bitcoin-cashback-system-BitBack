"""Export survey responses to CSV for the report's analysis.

    DATABASE_URL='postgresql://...neon.tech/...?sslmode=require' \\
        python -m scripts.export_survey survey.csv

Every row is written, with a `cohort` column so the analysis can filter
rather than the export deciding what counts:

    used_app      answered Q4-Q7 after saying they had used the app
    concept_only  had not used the app; Q4-Q7 are empty by design
    legacy        stored before the has_used_app question existed, so its
                  Q4-Q7 answers may not be grounded - analyse separately
    screened_out  active trader, screened out before the questions

The free-text answers (Q9, Q10) are included because thematic coding needs
them. The file is therefore for your own analysis only: quote from it in the
report, but do not publish it whole. Responses carry no account, email or IP.
"""
import csv
import sys

from app.database import SessionLocal
from app.models import SurveyResponse
from app.routers.survey import cohort

COLUMNS = ["id", "created_at", "source", "cohort", "screened_out", "has_used_app",
           "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]


def export(path: str) -> int:
    db = SessionLocal()
    try:
        rows = db.query(SurveyResponse).order_by(SurveyResponse.created_at).all()
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(COLUMNS)
            for r in rows:
                writer.writerow([
                    r.id, r.created_at.isoformat(timespec="seconds"), r.source, cohort(r),
                    r.screened_out, r.has_used_app,
                    r.q1, r.q2, r.q3, r.q4, r.q5, r.q6, r.q7, r.q8, r.q9, r.q10,
                ])
        return len(rows)
    finally:
        db.close()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "survey_responses.csv"
    print(f"wrote {export(out)} responses to {out}")
