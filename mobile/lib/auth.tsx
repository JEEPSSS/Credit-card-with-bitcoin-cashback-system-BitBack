import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { router } from "expo-router";
import { authAPI, tokenStore, setUnauthorizedHandler } from "./api";

type User = { id: number; email: string; display_name: string };

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
    router.replace("/(auth)/login");
  }, []);

  const signIn = useCallback(async (token: string, u: User) => {
    await tokenStore.set(token);
    setUser(u);
    router.replace("/(tabs)");
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await authAPI.me());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.replace("/(auth)/login");
    });
    (async () => {
      const token = await tokenStore.get();
      if (token) await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  return <Ctx.Provider value={{ user, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}
