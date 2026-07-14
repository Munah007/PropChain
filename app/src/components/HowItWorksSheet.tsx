"use client";

import { Sheet } from "./ui";

const STEPS = [
  {
    n: "01",
    title: "Pick a match & market",
    body: "Winner, GG/NG, totals, corners, cards — any World Cup fixture. Set the line or take a side on someone else's market.",
  },
  {
    n: "02",
    title: "Stake either side",
    body: "In pUSDC. Funds sit in an on-chain escrow no one — including us — can touch.",
  },
  {
    n: "03",
    title: "Proof pays the winners",
    body: "At full time a TxLINE Merkle proof of the real stat settles every market on-chain, verified by a CPI into TxLINE's oracle. No bookmaker, no admin key, no operator who could fabricate an outcome.",
  },
];

export function HowItWorksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How PropChain works">
      <p className="mb-5 text-sm leading-relaxed text-ink-2">
        Peer-to-peer prop bets on live TxLINE World Cup data — settled by cryptographic
        proof, not by a bookmaker.
      </p>
      <ol className="space-y-3">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-2xl border border-hairline bg-raised p-4">
            <p className="tnum text-[11px] font-bold text-over">{s.n}</p>
            <h3 className="mt-1 text-sm font-bold text-ink">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">{s.body}</p>
          </li>
        ))}
      </ol>
      <a
        className="mt-5 block text-center text-xs text-ink-3 transition hover:text-ink"
        href="https://explorer.solana.com/address/3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU?cluster=devnet"
        target="_blank"
        rel="noreferrer"
      >
        Built for the TxODDS World Cup Hackathon · inspect the on-chain program ↗
      </a>
    </Sheet>
  );
}
