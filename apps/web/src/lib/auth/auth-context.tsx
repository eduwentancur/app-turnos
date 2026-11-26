"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, parseApiError } from "@/lib/api-client";
import type { AuthSession, AuthStatus, PublicUser } from "./types";

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** fetch autenticado: agrega el access token y renueva la sesión si venció. */
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  setSession: (session: AuthSession) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Una sola renovación en vuelo por pestaña (evita rotar el mismo token dos veces,
// por ejemplo con el doble render de React en desarrollo).
let refreshInFlight: Promise<AuthSession | null> | null = null;

async function requestRefresh(retryOnRace = true): Promise<AuthSession | null> {
  const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
  if (res.ok) return (await res.json()) as AuthSession;

  const error = await parseApiError(res);
  // Otra pestaña renovó la sesión al mismo tiempo: el navegador ya tiene la cookie nueva
  if (error.code === "RefreshRace" && retryOnRace) {
    await new Promise((r) => setTimeout(r, 400));
    return requestRefresh(false);
  }
  return null;
}

function refreshSession(): Promise<AuthSession | null> {
  refreshInFlight ??= requestRefresh()
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  const accessToken = useRef<string | null>(null);

  const setSession = useCallback((session: AuthSession) => {
    accessToken.current = session.accessToken;
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(() => {
    accessToken.current = null;
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  // Al cargar la app, intenta recuperar la sesión con la cookie de refresh
  useEffect(() => {
    let cancelled = false;
    void refreshSession().then((session) => {
      if (cancelled) return;
      if (session) setSession(session);
      else clearSession();
    });
    return () => {
      cancelled = true;
    };
  }, [setSession, clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw await parseApiError(res);
      setSession((await res.json()) as AuthSession);
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const send = () => {
        const headers = new Headers(init.headers);
        if (accessToken.current) headers.set("Authorization", `Bearer ${accessToken.current}`);
        if (init.body && !headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
        return fetch(path, { ...init, headers });
      };

      let res = await send();
      if (res.status === 401) {
        const session = await refreshSession();
        if (!session) {
          clearSession();
          throw new ApiError(401, "Unauthorized", ["Tu sesión expiró. Ingresá de nuevo."]);
        }
        setSession(session);
        res = await send();
      }
      return res;
    },
    [clearSession, setSession],
  );

  const value = useMemo(
    () => ({ status, user, login, logout, apiFetch, setSession }),
    [status, user, login, logout, apiFetch, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
