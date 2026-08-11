import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { router } from "expo-router";

import { authAPI, setUnauthorizedHandler, tokenStore } from "./api";
import type { TokenResponse, User } from "./types";

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (response: TokenResponse) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
    router.replace("/(auth)/login");
  }, []);

  /**
   * Takes the whole token response rather than a token and a user.
   *
   * The backend omits `user` when a login still needs a second factor, so the
   * two fields are not independently available and passing them separately let
   * a null user reach the provider. Where it is missing - which should not
   * happen on a completed sign-in - the profile is fetched rather than assumed.
   */
  const signIn = useCallback(async (response: TokenResponse) => {
    await tokenStore.set(response.access_token);
    setUser(response.user ?? (await authAPI.me()));
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
    void (async () => {
      const token = await tokenStore.get();
      if (token) await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  return <Ctx.Provider value={{ user, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}
