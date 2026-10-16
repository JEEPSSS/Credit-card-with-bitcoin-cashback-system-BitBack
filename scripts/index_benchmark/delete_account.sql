\timing on
BEGIN;
DELETE FROM reward_events WHERE user_id = 1;
DELETE FROM transaction_risk_scores WHERE user_id = 1;
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) DELETE FROM transactions WHERE user_id = 1;
ROLLBACK;
