-- 200 users; user 1 is the heavy user being measured.
INSERT INTO users (id, email, password_hash, display_name, is_active, created_at)
SELECT g, 'u'||g||'@b.io', 'x', 'U'||g, true, now() FROM generate_series(1,200) g;
-- 20,000 transactions for user 1, 100 each for the rest.
INSERT INTO transactions (user_id, amount_fiat, currency, category, merchant, btc_price_at_time, sats_earned, status, created_at)
SELECT CASE WHEN g <= 20000 THEN 1 ELSE 2 + (g % 199) END, 25, 'USD', 'dining', 'M', 60000, 100, 'completed', now() - (g || ' minutes')::interval
FROM generate_series(1, 20000 + 19900) g;
INSERT INTO reward_events (user_id, transaction_id, btc_amount, btc_price, cashback_rate, level_multiplier, boost_multiplier, category, created_at)
SELECT user_id, id, 100, 60000, 0.03, 1, 1, 'dining', created_at FROM transactions;
INSERT INTO transaction_risk_scores (transaction_id, user_id, risk_score, is_anomaly, features_used, model_version, created_at)
SELECT id, user_id, (id % 100), (id % 50 = 0), '{}', 'iforest-v2', created_at FROM transactions;
-- One notification per transaction, almost all read; a few unread.
INSERT INTO notifications (user_id, title, message, type, icon, is_read, created_at)
SELECT user_id, 't', 'm', 'reward', 'bitcoin', (id % 500 <> 0), created_at FROM transactions;
-- 100,000 alerts over the platform's life, 99.8% already triggered.
INSERT INTO price_alerts (user_id, target_price, direction, is_triggered, created_at)
SELECT 1 + (g % 200), 50000 + g, 'above', (g % 500 <> 0), now() FROM generate_series(1,100000) g;
ANALYZE;
