import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

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
  async (error) => {
    if (error.response?.status === 401) {
      await tokenStore.clear();
      onUnauthorized?.();
    }
    // Surface the backend's own message rather than "Request failed with status 400".
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
      error.friendlyMessage = detail;
    } else if (Array.isArray(detail)) {
      error.friendlyMessage = detail.map((d: any) => d.msg ?? JSON.stringify(d)).join("; ");
    } else {
      error.friendlyMessage =
        error.code === "ECONNABORTED" || !error.response
          ? `Can't reach the server at ${BASE_URL}. Check it's running.`
          : "Something went wrong. Try again.";
    }
    return Promise.reject(error);
  },
);

const get = <T,>(url: string) => api.get<T>(url).then((r) => r.data);
const post = <T,>(url: string, body?: unknown) => api.post<T>(url, body).then((r) => r.data);
const put = <T,>(url: string, body?: unknown) => api.put<T>(url, body).then((r) => r.data);
const del = <T,>(url: string) => api.delete<T>(url).then((r) => r.data);

export const authAPI = {
  register: (b: { email: string; password: string; display_name: string; referral_code?: string }) =>
    post<any>("/api/auth/register", b),
  login: (b: { email: string; password: string }) => post<any>("/api/auth/login", b),
  me: () => get<any>("/api/auth/me"),
  forgotPassword: (email: string) => post<any>("/api/auth/forgot-password", { email }),
  resetPassword: (b: { token: string; new_password: string }) => post<any>("/api/auth/reset-password", b),
};

export const securityAPI = {
  status: () => get<any>("/api/auth/2fa/status"),
  setup: () => post<any>("/api/auth/2fa/setup"),
  verify: (code: string) => post<any>("/api/auth/2fa/verify", { code }),
  disable: (code: string) => post<any>("/api/auth/2fa/disable", { code }),
  authenticate: (b: { challenge_token: string; code: string }) =>
    post<any>("/api/auth/2fa/authenticate", b),
};

export const transactionAPI = {
  create: (b: { amount_fiat: number; category: string; merchant: string }) =>
    post<any>("/api/transactions", b),
  list: (page = 1, category?: string) =>
    get<any>(`/api/transactions?page=${page}${category ? `&category=${category}` : ""}`),
};

export const walletAPI = {
  balance: () => get<any>("/api/wallet"),
  growth: (period: string) => get<any>(`/api/wallet/growth?period=${period}`),
  transactions: () => get<any>("/api/wallet/transactions"),
};

export const rewardsAPI = {
  summary: () => get<any>("/api/rewards/summary"),
  preview: (b: { amount_fiat: number; category: string }) => post<any>("/api/rewards/preview", b),
  boosts: () => get<any>("/api/rewards/boosts"),
  activate: (category: string) => post<any>("/api/rewards/boosts/activate", { category }),
};

export const analyticsAPI = {
  spending: (period = "30d") => get<any>(`/api/analytics/spending?period=${period}`),
  insights: () => get<any>("/api/analytics/insights"),
  recap: () => get<any>("/api/analytics/recap"),
};

export const aiAPI = {
  forecast: () => get<any>("/api/forecast"),
  fraudSummary: () => get<any>("/api/fraud/summary"),
  fraudFlagged: () => get<any>("/api/fraud/flagged"),
  boostRecommendation: () => get<any>("/api/ai/boost-recommendation"),
  persona: () => get<any>("/api/ai/persona"),
};

export const goalsAPI = {
  list: () => get<any>("/api/goals"),
  create: (b: { name: string; target_sats: number; icon?: string }) => post<any>("/api/goals", b),
  allocate: (id: number, sats: number) => post<any>(`/api/goals/${id}/allocate`, { sats }),
  remove: (id: number) => del<any>(`/api/goals/${id}`),
};

export const configAPI = {
  getRoundup: () => get<any>("/api/roundup/config"),
  setRoundup: (b: { is_enabled: boolean; multiplier: number }) => put<any>("/api/roundup/config", b),
  getAutoWithdraw: () => get<any>("/api/auto-withdraw/config"),
  setAutoWithdraw: (b: any) => put<any>("/api/auto-withdraw/config", b),
};

export const miscAPI = {
  btcPrice: () => get<any>("/api/btc/price"),
  categories: () => get<any>("/api/categories"),
  referral: () => get<any>("/api/referral"),
  leaderboard: () => get<any>("/api/referral/leaderboard"),
  alerts: () => get<any>("/api/alerts"),
  createAlert: (b: { target_price: number; direction: string }) => post<any>("/api/alerts", b),
  deleteAlert: (id: number) => del<any>(`/api/alerts/${id}`),
  notifications: () => get<any>("/api/notifications"),
  readAll: () => post<any>("/api/notifications/read-all"),
};
