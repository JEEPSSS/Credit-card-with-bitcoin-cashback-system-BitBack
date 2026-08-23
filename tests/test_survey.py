"""Chapter 3.6's survey endpoint: anonymous submission, the active-trader
screen, and the aggregate summary."""
from app import rate_limit


def full_payload(source="web", screen_active_trader=False, has_used_app=True, **overrides):
    body = {
        "source": source,
        "screen_active_trader": screen_active_trader,
        "has_used_app": has_used_app,
        "q1": 4, "q2": 3, "q3": 5, "q4": 4, "q5": 3, "q6": 5, "q7": 4,
        "q8": "more",
        "q9": "Not sure I trust a prototype with real spending yet.",
        "q10": "A way to see the forecast confidence interval, not just a point estimate.",
    }
    body.update(overrides)
    return body


def test_a_full_response_is_recorded(client):
    r = client.post("/api/survey/responses", json=full_payload())
    assert r.status_code == 200
    assert r.json()["screened_out"] is False


def test_an_active_trader_is_screened_out_and_questions_are_dropped(client):
    r = client.post("/api/survey/responses", json=full_payload(screen_active_trader=True))
    assert r.status_code == 200
    assert r.json()["screened_out"] is True

    summary = client.get("/api/survey/summary").json()
    assert summary["screened_out"] == 1
    assert summary["included"] == 0


def test_a_non_screened_response_missing_a_likert_answer_is_rejected(client):
    body = full_payload()
    body["q4"] = None
    r = client.post("/api/survey/responses", json=body)
    assert r.status_code == 400


def test_an_out_of_range_likert_value_is_rejected(client):
    body = full_payload()
    body["q3"] = 7
    r = client.post("/api/survey/responses", json=body)
    assert r.status_code == 422


def test_missing_has_used_app_is_rejected(client):
    body = full_payload()
    body["has_used_app"] = None
    r = client.post("/api/survey/responses", json=body)
    assert r.status_code == 400
    assert "has_used_app" in r.json()["detail"]


def test_a_respondent_who_has_not_used_the_app_can_skip_q4_to_q7(client):
    # Q4-Q7 presuppose screens (the forecast, the fraud-flagging view) that a
    # respondent who has never used the app hasn't seen -- they shouldn't be
    # required, or even accepted, from that respondent.
    body = full_payload(has_used_app=False)
    for f in ("q4", "q5", "q6", "q7"):
        body[f] = None
    r = client.post("/api/survey/responses", json=body)
    assert r.status_code == 200

    summary = client.get("/api/survey/summary").json()
    assert summary["included"] == 1
    assert summary["used_app_count"] == 0
    # Concept items still aggregate normally.
    assert summary["likert_means"]["q1"] == 4.0
    # App-experience items have no data behind them yet.
    assert summary["likert_means"]["q4"] is None


def test_q4_to_q7_are_dropped_even_if_supplied_when_has_used_app_is_false(client):
    # Belt and suspenders: even a client that sends Q4-Q7 anyway despite
    # answering "no" to has_used_app shouldn't get them stored as if they
    # were grounded answers.
    r = client.post("/api/survey/responses", json=full_payload(has_used_app=False))
    assert r.status_code == 200

    summary = client.get("/api/survey/summary").json()
    assert summary["used_app_count"] == 0
    assert summary["likert_means"]["q4"] is None


def test_used_app_count_reflects_only_included_respondents_who_used_it(client):
    client.post("/api/survey/responses", json=full_payload(has_used_app=True))
    client.post("/api/survey/responses", json=full_payload(has_used_app=False, q4=None, q5=None, q6=None, q7=None))
    client.post("/api/survey/responses", json=full_payload(screen_active_trader=True))  # excluded entirely

    summary = client.get("/api/survey/summary").json()
    assert summary["total_responses"] == 3
    assert summary["included"] == 2
    assert summary["used_app_count"] == 1


def test_the_summary_aggregates_across_both_channels(client):
    client.post("/api/survey/responses", json=full_payload(source="web", q1=5, q2=5))
    client.post("/api/survey/responses", json=full_payload(source="app", q1=3, q2=3))

    summary = client.get("/api/survey/summary").json()
    assert summary["total_responses"] == 2
    assert summary["included"] == 2
    assert summary["by_source"] == {"web": 1, "app": 1}
    assert summary["likert_means"]["q1"] == 4.0  # mean of 5 and 3


def test_the_summary_never_exposes_free_text(client):
    client.post("/api/survey/responses", json=full_payload(q9="a private opinion"))
    summary = client.get("/api/survey/summary")
    assert "a private opinion" not in summary.text


def test_repeated_submissions_are_rate_limited(client):
    rate_limit.reset()
    for _ in range(5):
        assert client.post("/api/survey/responses", json=full_payload()).status_code == 200
    assert client.post("/api/survey/responses", json=full_payload()).status_code == 429
