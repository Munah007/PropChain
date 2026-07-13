"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Session } from "./api";

/** Poll an async source on an interval; refetch() for instant refresh. */
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refetch = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, intervalMs);
    return () => clearInterval(id);
  }, [refetch, intervalMs]);

  return { data, error, refetch };
}

/**
 * Session = userKey remembered locally; the server owns the wallet. Signing in
 * (first POST /session) creates and auto-funds a server-side wallet.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (userKey: string, name?: string) => {
    setLoading(true);
    try {
      const s = await api.session(userKey, name);
      setSession(s);
      localStorage.setItem("propchain.userKey", userKey);
      return s;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("propchain.userKey");
    if (saved) refresh(saved).catch(() => localStorage.removeItem("propchain.userKey"));
  }, [refresh]);

  const signOut = useCallback(() => {
    localStorage.removeItem("propchain.userKey");
    setSession(null);
  }, []);

  return { session, loading, signIn: refresh, refresh, signOut };
}
