"""Offline evaluation of the analytical models.

Kept out of `app/` deliberately: nothing here runs in the request path, and the
API must not be able to import it. Run it with

    python -m evaluation.run

which writes `evaluation_results.json` alongside a printed summary.

The honest scope of what this measures is stated in each module and repeated in
the report. In short: the fraud figures are against *synthetic* fraud that this
harness injects, so they measure whether the detector separates the anomaly
types it was designed around from a user's normal behaviour. They are not a
claim about real card fraud, for which no labelled data exists here.
"""
