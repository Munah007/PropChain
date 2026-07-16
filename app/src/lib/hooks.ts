"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, setSessionToken, type Session } from "./api";

/**
 * Unix seconds, advancing on its own timer.
 *
 * Time-derived UI (match phase, day grouping) must not be computed from a
 * Date.now() captured inside a data-keyed useMemo: polls keep their last-good
 * value on error, so a sustained API failure would otherwise freeze the clock
 * and pin every card at the phase it held when the feed went quiet. Ticking
 * independently means kickoffs and the LIVE/finished backstop keep landing
 * whether or not fresh data ever arrives. 1s to match <Countdown>, so a card
 * flips the instant its countdown reaches zero.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

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
      if (s.sessionToken) {
        setSessionToken(s.sessionToken);
        localStorage.setItem("propchain.sessionToken", s.sessionToken);
      }
      setSession(s);
      localStorage.setItem("propchain.userKey", userKey);
      return s;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Restore the bearer token BEFORE the reload /session call — a returning
    // session bypasses the faucet throttle only when it presents its token.
    setSessionToken(localStorage.getItem("propchain.sessionToken"));
    const saved = localStorage.getItem("propchain.userKey");
    if (saved)
      refresh(saved).catch(() => {
        localStorage.removeItem("propchain.userKey");
        localStorage.removeItem("propchain.sessionToken");
        setSessionToken(null);
      });
  }, [refresh]);

  const signOut = useCallback(() => {
    localStorage.removeItem("propchain.userKey");
    localStorage.removeItem("propchain.sessionToken");
    setSessionToken(null);
    setSession(null);
  }, []);

  return { session, loading, signIn: refresh, refresh, signOut };
}
