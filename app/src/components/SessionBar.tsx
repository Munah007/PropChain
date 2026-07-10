"use client";

import { useState } from "react";
import type { Session } from "@/lib/api";
import { money, shortAddress, explorerUrl } from "@/lib/format";
import { Button } from "./ui";

export function SessionBar({
  session,
  loading,
  onSignIn,
  onSignOut,
}: {
  session: Session | null;
  loading: boolean;
  onSignIn: (userKey: string) => Promise<unknown>;
  onSignOut: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-3 rounded-full border border-hairline bg-surface px-4 py-1.5 sm:flex">
          <span className="tnum text-sm font-semibold text-ink">{money(session.pusdc)} <span className="text-xs font-normal text-ink-3">pUSDC</span></span>
          <span className="h-3 w-px bg-hairline" aria-hidden />
          <a
            href={explorerUrl(session.address)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-3 hover:text-ink-2"
            title="Your server-managed wallet on Solana Explorer"
          >
            {shortAddress(session.address)} ↗
          </a>
        </div>
        <button onClick={onSignOut} className="text-xs text-ink-3 hover:text-ink-2">
          {session.userKey} · sign out
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email.includes("@")) return setError(true);
        setError(false);
        await onSignIn(email.trim().toLowerCase());
      }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        aria-label="Email to sign in"
        aria-invalid={error}
        className={`w-44 rounded-lg border bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-over ${error ? "border-critical" : "border-hairline"}`}
      />
      <Button type="submit" disabled={loading}>
        {loading ? "Setting up wallet…" : "Sign in"}
      </Button>
    </form>
  );
}
