\echo '--- Q1 alert sweep (every 60 s)'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT * FROM price_alerts WHERE is_triggered = false;
\echo '--- Q2 unread badge count (every notifications load)'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT count(*) FROM notifications WHERE user_id = 1 AND is_read = false;
\echo '--- Q3 flagged transactions'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT * FROM transaction_risk_scores WHERE user_id = 1 AND is_anomaly = true ORDER BY risk_score DESC;
\echo '--- Q4 reward for one transaction (receipt / relationship load)'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT * FROM reward_events WHERE transaction_id = 777;
