"use client";

// Sign-in is asked for at the moment of action, never before. This sheet
// explains exactly what happens (wallet created + funded server-side) and
// resumes the user's intent after success.

import { useState } from "react";
import { Button, Sheet } from "./ui";

export function AuthSheet({
  open,
  intent,
  loading,
  onClose,
  onSignIn,
}: {
  open: boolean;
  intent: string | null; // "stake on Over" / "create a bet" / "claim winnings"
  loading: boolean;
  onClose: () => void;
  onSignIn: (userKey: string) => Promise<unknown>;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet open={open} onClose={onClose} title={intent ? `Sign in to ${intent}` : "Sign in"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.includes("@")) return setError("Enter a valid email");
          setError(null);
          try {
            await onSignIn(email.trim().toLowerCase());
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email"
          className="w-full rounded-xl border border-hairline bg-raised px-4 py-3 text-base text-ink outline-none placeholder:text-ink-3 focus:border-over"
        />

        <ul className="space-y-2 text-sm text-ink-2">
          {[
            "A Solana wallet is created for you — nothing to install, no seed phrase",
            "Funded instantly with 100 pUSDC test money + gas",
            "Every transaction is verifiable on Solana Explorer",
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <span className="mt-0.5 text-good" aria-hidden>✓</span>
              {line}
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-critical">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full py-3 text-base">
          {loading ? "Creating your wallet…" : "Continue"}
        </Button>
        <p className="text-center text-xs text-ink-3">Devnet demo — test funds only, no real money.</p>
      </form>
    </Sheet>
  );
}
