import axios, { AxiosError } from "axios";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import type {
  AutoWithdrawConfig, BoostAdvice, Boosts, BtcPrice, Category, Forecast,
  FlaggedTransaction, FraudSummary, Goal, Insights, LeaderboardRow, LedgerEntry,
  Notifications, Page, Persona, PriceAlert, Recap, Referral, RewardBreakdown,
  RewardsSummary, RoundUpConfig, Spending, TokenResponse, Transaction,
  TransactionResult, TwoFactorSetup, TwoFactorStatus, User, Wallet, WalletGrowth,
} from "./types";

/**
 * On a physical device "localhost" resolves to the phone, not the dev machine,
 * so the LAN address Expo is already serving over is reused as the API host.
 * Override with EXPO_PUBLIC_API_URL when pointing at a deployed backend.
 */
function resolveBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:8000` : "http://localhost:8000";
}

export const BASE_URL = resolveBaseUrl();
const TOKEN_KEY = "bitback.token";

export const api = axios.create({ baseURL: BASE_URL, timeout: 12000 });

/** Every rejected request carries a message safe to show the user. */
export type ApiError = AxiosError & { friendlyMessage: string };

export function messageFor(error: unknown): string {
  return (error as ApiError)?.friendlyMessage ?? "Something went wrong. Try again.";
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export const tokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (t: string) => SecureStore.setItemAsync(TOKEN_KEY, t),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

api.interceptors.request.use(async (config) => {
  const token = await tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await tokenStore.clear();
      onUnauthorized?.();
    }
    // Surface the backend's own message rather than "Request failed with status 400".
    const detail = (error.response?.data as { detail?: unknown })?.detail;
    let friendly: string;
    if (typeof detail === "string") {
      friendly = detail;
    } else if (Array.isArray(detail)) {
      friendly = detail.map((d) => (d as { msg?: string }).msg ?? JSON.stringify(d)).join("; ");
    } else if (detail && typeof detail === "object" && "message" in detail) {
      friendly = String((detail as { message: unknown }).message);
    } else if (error.code === "ECONNABORTED" || !error.response) {
      friendly = `Can't reach the server at ${BASE_URL}. Check it's running.`;
    } else {
      friendly = "Something went wrong. Try again.";
    }
    (error as ApiError).friendlyMessage = friendly;
    return Promise.reject(error);
  },
);

const get = <T>(url: string) => api.get<T>(url).then((r) => r.data);
const post = <T>(url: string, body?: unknown, headers?: Record<string, string>) =>
  api.post<T>(url, body, headers ? { headers } : undefined).then((r) => r.data);
const put = <T>(url: string, body?: unknown) => api.put<T>(url, body).then((r) => r.data);
const del = <T>(url: string) => api.delete<T>(url).then((r) => r.data);

/**
 * Idempotency key for a payout request. The backend rejects a repeat of a key
 * it has already recorded, so a retry after a timeout - or a double-tap that
 * beats the disabled state on the button - cannot pay the reward twice.
 */
export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const authAPI = {
  register: (b: { email: string; password: string; display_name: string; referral_code?: string }) =>
    post<TokenResponse>("/api/auth/register", b),
  login: (b: { email: string; password: string }) => post<TokenResponse>("/api/auth/login", b),
  me: () => get<User>("/api/auth/me"),
  forgotPassword: (email: string) =>
    post<{ message: string; reset_token?: string }>("/api/auth/forgot-password", { email }),
  resetPassword: (b: { token: string; new_password: string }) =>
    post<{ message: string }>("/api/auth/reset-password", b),
};

export const securityAPI = {
  status: () => get<TwoFactorStatus>("/api/auth/2fa/status"),
  setup: () => post<TwoFactorSetup>("/api/auth/2fa/setup"),
  verify: (code: string) => post<{ message: string; is_enabled: boolean }>("/api/auth/2fa/verify", { code }),
  disable: (code: string) => post<{ message: string; is_enabled: boolean }>("/api/auth/2fa/disable", { code }),
  authenticate: (b: { challenge_token: string; code: string }) =>
    post<TokenResponse>("/api/auth/2fa/authenticate", b),
};

export const transactionAPI = {
  create: (b: { amount_fiat: number; category: string; merchant: string }, idempotencyKey: string) =>
    post<TransactionResult>("/api/transactions", b, { "Idempotency-Key": idempotencyKey }),
  list: (page = 1, category?: string) =>
    get<Page<Transaction>>(
      `/api/transactions?page=${page}${category ? `&category=${category}` : ""}`),
};

export const walletAPI = {
  balance: () => get<Wallet>("/api/wallet"),
  growth: (period: string) => get<WalletGrowth>(`/api/wallet/growth?period=${period}`),
  transactions: () => get<LedgerEntry[]>("/api/wallet/transactions"),
};

export const rewardsAPI = {
  summary: () => get<RewardsSummary>("/api/rewards/summary"),
  preview: (b: { amount_fiat: number; category: string }) =>
    post<RewardBreakdown>("/api/rewards/preview", b),
  boosts: () => get<Boosts>("/api/rewards/boosts"),
  activate: (category: string) =>
    post<ActiveBoostResponse>("/api/rewards/boosts/activate", { category }),
};

type ActiveBoostResponse = { category: string; multiplier: number; expires_at: string };

export const analyticsAPI = {
  spending: (period = "30d") => get<Spending>(`/api/analytics/spending?period=${period}`),
  insights: () => get<Insights>("/api/analytics/insights"),
  recap: () => get<Recap>("/api/analytics/recap"),
};

export const aiAPI = {
  forecast: () => get<Forecast>("/api/forecast"),
  fraudSummary: () => get<FraudSummary>("/api/fraud/summary"),
  fraudFlagged: () => get<FlaggedTransaction[]>("/api/fraud/flagged"),
  boostRecommendation: () => get<BoostAdvice>("/api/ai/boost-recommendation"),
  persona: () => get<Persona>("/api/ai/persona"),
};

export const goalsAPI = {
  list: () => get<Goal[]>("/api/goals"),
  create: (b: { name: string; target_sats: number; icon?: string }) => post<Goal>("/api/goals", b),
  allocate: (id: number, sats: number) =>
    post<{ id: number; current_sats: number; is_completed: boolean; wallet_balance_sats: number }>(
      `/api/goals/${id}/allocate`, { sats }),
  remove: (id: number) => del<{ message: string; sats_returned: number }>(`/api/goals/${id}`),
};

export const configAPI = {
  getRoundup: () => get<RoundUpConfig>("/api/roundup/config"),
  setRoundup: (b: RoundUpConfig) => put<RoundUpConfig>("/api/roundup/config", b),
  getAutoWithdraw: () => get<AutoWithdrawConfig>("/api/auto-withdraw/config"),
  setAutoWithdraw: (b: AutoWithdrawConfig) => put<AutoWithdrawConfig>("/api/auto-withdraw/config", b),
};

export const miscAPI = {
  btcPrice: () => get<BtcPrice>("/api/btc/price"),
  categories: () => get<Category[]>("/api/categories"),
  referral: () => get<Referral>("/api/referral"),
  leaderboard: () => get<LeaderboardRow[]>("/api/referral/leaderboard"),
  alerts: () => get<PriceAlert[]>("/api/alerts"),
  createAlert: (b: { target_price: number; direction: string }) =>
    post<PriceAlert>("/api/alerts", b),
  deleteAlert: (id: number) => del<{ message: string }>(`/api/alerts/${id}`),
  notifications: () => get<Notifications>("/api/notifications"),
  readAll: () => post<{ marked_read: number }>("/api/notifications/read-all"),
};
