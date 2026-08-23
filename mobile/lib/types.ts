/**
 * API response shapes.
 *
 * Hand-written against the FastAPI schemas in `app/schemas.py` and the router
 * return values. Before this file every call was `get<any>`, so TypeScript
 * caught nothing: a renamed backend field surfaced as a runtime crash on
 * whichever screen happened to read it.
 *
 * The next step, worth doing and noted in the report, is to generate this file
 * from the OpenAPI document the backend already publishes at `/openapi.json`:
 *
 *     npx openapi-typescript http://localhost:8000/openapi.json -o lib/api-schema.ts
 *
 * That makes the Pydantic models the single source of truth for both ends and
 * turns drift into a compile error instead of a maintenance habit.
 */
import type { CategoryKey } from './theme';

export type User = {
  id: number;
  email: string;
  display_name: string;
  created_at?: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  requires_2fa: boolean;
  challenge_token: string | null;
  user: User | null;
};

// ------------------------------------------------------------------- market
export type BtcPrice = {
  price: number;
  change_24h: number;
  currency: string;
  sats_per_dollar: number;
};

export type Category = {
  category: CategoryKey;
  base_rate: number;
  icon: string;
  description: string;
};

// ------------------------------------------------------------- transactions
export type Transaction = {
  id: number;
  amount_fiat: number;
  currency: string;
  category: CategoryKey;
  merchant: string;
  btc_price_at_time: number;
  sats_earned: number;
  status: string;
  created_at: string;
};

export type RewardBreakdown = {
  base_sats: number;
  level_bonus: number;
  boost_bonus: number;
  total_sats: number;
  cashback_rate: number;
  effective_rate: number;
  level_multiplier: number;
  boost_multiplier: number;
  usd_value: number;
};

export type Level = {
  key: string;
  name: string;
  icon: string;
  min_sats: number;
  multiplier: number;
  next_level: string | null;
  next_level_sats: number | null;
  progress: number;
  sats_to_next: number;
};

export type Badge = {
  key: string;
  name: string;
  icon: string;
  description: string;
  earned?: boolean;
  earned_at?: string;
};

export type RiskAssessment = {
  score: number;
  is_anomaly: boolean;
  model: string;
  features: Record<string, number>;
};

export type TransactionResult = {
  transaction: Transaction;
  reward: RewardBreakdown;
  round_up: { spare_usd: number; sats: number; multiplier: number } | null;
  new_badges: Badge[];
  streak: { current: number; longest: number };
  level: Level;
  wallet_balance_sats: number;
  risk: RiskAssessment;
};

export type Page<T> = {
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
  items: T[];
};

// ------------------------------------------------------------------- wallet
export type Wallet = {
  balance_sats: number;
  balance_btc: number;
  balance_usd: number;
  btc_price: number;
  updated_at: string | null;
};

export type GrowthPoint = { date: string; sats: number; usd: number };

export type WalletGrowth = {
  period: string;
  points: GrowthPoint[];
  growth_sats: number;
};

export type LedgerEntry = {
  id: number;
  amount_sats: number;
  type: string;
  status: string;
  created_at: string;
};

// ------------------------------------------------------------------ rewards
export type ActiveBoost = {
  category: CategoryKey;
  multiplier: number;
  expires_at: string;
  days_remaining?: number;
};

export type RewardsSummary = {
  total_sats_earned: number;
  total_usd_earned: number;
  transaction_count: number;
  level: Level;
  levels: Level[];
  streak: { current: number; longest: number };
  badges: { earned: Badge[]; all: Badge[]; earned_count: number; total_count: number };
  active_boost: ActiveBoost | null;
};

export type BoostOption = {
  category: CategoryKey;
  base_rate: number;
  boosted_rate: number;
  icon: string;
  description: string;
  is_active: boolean;
};

export type Boosts = { active: ActiveBoost | null; available: BoostOption[] };

// ---------------------------------------------------------------- analytics
export type CategorySpend = {
  category: CategoryKey;
  total_spent: number;
  sats_earned: number;
  transaction_count: number;
  icon: string;
  share: number;
};

export type Spending = {
  period: string;
  total_spent: number;
  total_sats: number;
  categories: CategorySpend[];
};

export type Insights =
  | { has_data: false; message: string }
  | {
      has_data: true;
      top_category: { category: CategoryKey; total_spent: number };
      average_transaction: number;
      daily_average_sats: number;
      biggest_reward: { merchant: string; sats: number; amount_fiat: number };
      effective_rate: number;
      projected_yearly_sats: number;
    };

export type Recap =
  | { has_data: false; message: string }
  | {
      has_data: true;
      period: string;
      total_sats: number;
      total_usd: number;
      total_spent: number;
      transaction_count: number;
      top_category: { category: CategoryKey; sats: number };
      biggest_reward: { merchant: string; sats: number };
      streak: number;
      percentile: number;
      fun_facts: string[];
    };

// ------------------------------------------------------------------- models
export type Forecast =
  | { has_enough_data: false; message: string; predicted_sats_30d: number; days_of_data: number }
  | {
      has_enough_data: true;
      predicted_sats_30d: number;
      predicted_usd_30d: number;
      lower_bound: number;
      upper_bound: number;
      confidence: number;
      trend_direction: 'increasing' | 'decreasing' | 'stable';
      daily_average_sats: number;
      weekly_average_sats: number;
      days_of_data: number;
      model_comparison: {
        linear_regression: { predicted_sats: number; r2: number; slope_per_week: number };
        holt_damped: {
          predicted_sats: number;
          alpha: number;
          beta: number;
          phi: number;
          level: number;
          trend: number;
        };
        blend_weights: { holt: number; linear: number };
      };
    };

export type FlaggedTransaction = {
  transaction_id: number;
  merchant: string;
  category: CategoryKey;
  amount_fiat: number;
  risk_score: number;
  model_version?: string;
  features: Record<string, number>;
  created_at: string;
};

export type FraudSummary = {
  protection_score: number;
  total_transactions_analyzed: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  model_version: string;
  feature_names: string[];
  recent_flags: FlaggedTransaction[];
};

export type BoostRecommendation = {
  category: CategoryKey;
  score: number;
  predicted_extra_usd: number;
  monthly_spend: number;
  transaction_count: number;
  base_rate: number;
  trend: string;
  recency: string;
  explanation: string;
  factors: Record<string, number>;
};

export type BoostAdvice =
  | { has_enough_data: false; message: string; recommendations: []; top_pick: null }
  | {
      has_enough_data: true;
      recommendations: BoostRecommendation[];
      top_pick: BoostRecommendation;
      weights: Record<string, number>;
    };

export type Persona =
  | { has_enough_data: false; message: string; transactions_needed: number }
  | {
      has_enough_data: true;
      persona: { key: string; name: string; icon: string; color: string; blurb: string };
      confidence: number;
      similarity: number;
      runner_up: string;
      top_categories: { category: CategoryKey; share: number }[];
      spending_vector: Record<string, number>;
      all_scores: { name: string; similarity: number }[];
    };

// -------------------------------------------------------------------- other
export type Goal = {
  id: number;
  name: string;
  target_sats: number;
  current_sats: number;
  icon: string;
  is_completed: boolean;
  progress: number;
  created_at?: string;
};

export type RoundUpConfig = { is_enabled: boolean; multiplier: number };

export type AutoWithdrawConfig = {
  is_enabled: boolean;
  threshold_sats: number;
  destination_address: string | null;
};

export type Referral = {
  code: string;
  total_referrals: number;
  total_sats_earned: number;
  referrer_bonus: number;
  welcome_bonus: number;
};

export type LeaderboardRow = {
  rank: number;
  display_name: string;
  total_referrals: number;
  total_sats_earned: number;
};

export type PriceAlert = {
  id: number;
  target_price: number;
  direction: 'above' | 'below';
  is_triggered: boolean;
  triggered_at?: string | null;
  created_at?: string;
};

export type AppNotification = {
  id: number;
  title: string;
  message: string;
  type: string;
  icon: string;
  is_read: boolean;
  created_at: string;
};

export type Notifications = Page<AppNotification> & { unread_count: number };

export type TwoFactorStatus = { is_enabled: boolean };

export type TwoFactorSetup = {
  secret: string;
  otpauth_uri: string;
  backup_codes: string[];
};

/** Chapter 3.6's instrument. `source` is always "app" from this client — the
 * standalone web page (served at /survey by the backend) sends "web" for the
 * same endpoint, so the two channels land in one dataset. */
export type SurveyResponseCreate = {
  source: "app";
  screen_active_trader: boolean;
  // Always true from this client -- reaching this screen means you're
  // already inside the app. The standalone web page (which a respondent can
  // reach without ever having used BitBack) asks this explicitly instead.
  has_used_app: boolean;
  q1?: number | null; q2?: number | null; q3?: number | null; q4?: number | null;
  q5?: number | null; q6?: number | null; q7?: number | null;
  q8?: "much_less" | "less" | "equally" | "more" | "much_more" | null;
  q9?: string | null;
  q10?: string | null;
};

export type SurveyResponseOut = { id: number; screened_out: boolean };
