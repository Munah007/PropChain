"use client";

// Sign-in is asked for at the moment of action, never before. Email-first:
// enter your email and we either log you back into your existing account or
// create a new one — the same email is always the same account (and the same
// wallet). Your name is only asked when creating.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Sheet } from "./ui";

type Step = "email" | "login" | "signup";

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
  onSignIn: (userKey: string, name?: string) => Promise<unknown>;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh start each time the sheet opens.
  useEffect(() => {
    if (open) {
      setStep("email");
      setName("");
      setError(null);
    }
  }, [open]);

  const title =
    step === "login"
      ? "Welcome back"
      : step === "signup"
        ? "Create your account"
        : intent
          ? `Sign in to ${intent}`
          : "Sign in";

  async function checkEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return setError("Enter a valid email");
    setError(null);
    setChecking(true);
    try {
      const { exists } = await api.accountExists(email.trim());
      setStep(exists ? "login" : "signup");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function logIn() {
    setError(null);
    try {
      await onSignIn(email.trim().toLowerCase()); // no name → keeps existing profile
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name");
    setError(null);
    try {
      await onSignIn(email.trim().toLowerCase(), name.trim());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const emailRow = (
    <button
      type="button"
      onClick={() => setStep("email")}
      className="flex w-full items-center justify-between rounded-xl border border-hairline bg-raised px-4 py-2.5 text-left"
    >
      <span className="truncate text-sm text-ink-2">{email.trim().toLowerCase()}</span>
      <span className="shrink-0 text-xs font-semibold text-over">Change</span>
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {step === "email" && (
        <form className="space-y-4" onSubmit={checkEmail}>
          <p className="text-sm text-ink-2">
            Log in or create your account with an email — no password, no seed phrase.
          </p>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            aria-label="Email"
            autoComplete="email"
            className="w-full rounded-xl border border-hairline bg-raised px-4 py-3 text-base text-ink outline-none placeholder:text-ink-3 focus:border-over"
          />
          {error && <p className="text-sm text-critical">{error}</p>}
          <Button type="submit" disabled={checking} className="w-full py-3 text-base">
            {checking ? "Checking…" : "Continue"}
          </Button>
          <p className="text-center text-xs text-ink-3">Devnet demo — test funds only, no real money.</p>
        </form>
      )}

      {step === "login" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Good to see you again. Log in to continue.</p>
          {emailRow}
          {error && <p className="text-sm text-critical">{error}</p>}
          <Button onClick={logIn} disabled={loading} className="w-full py-3 text-base">
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </div>
      )}

      {step === "signup" && (
        <form className="space-y-4" onSubmit={signUp}>
          <p className="text-sm text-ink-2">
            First time here — let&apos;s set up your account.
          </p>
          {emailRow}
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            aria-label="Name"
            autoComplete="name"
            className="w-full rounded-xl border border-hairline bg-raised px-4 py-3 text-base text-ink outline-none placeholder:text-ink-3 focus:border-over"
          />
          <ul className="space-y-2 text-sm text-ink-2">
            {[
              "Your account is ready instantly — nothing to install, no seed phrase",
              "Funded with 100 pUSDC test money + gas to start betting",
              "Every bet is yours on-chain, verifiable on Solana Explorer",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-0.5 text-good" aria-hidden>✓</span>
                {line}
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-critical">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full py-3 text-base">
            {loading ? "Creating your account…" : "Create account"}
          </Button>
          <p className="text-center text-xs text-ink-3">Devnet demo — test funds only, no real money.</p>
        </form>
      )}
    </Sheet>
  );
}
