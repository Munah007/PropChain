# PropChain

**Parametric prop bets on Solana, settled trustlessly by TxLINE's on-chain-verified World Cup data.**

Create a prop bet ("total corners in France–Morocco over 10"), stake USDC on either side, and let cryptography settle it: anyone can submit a TxLINE Merkle proof, our program CPIs into TxLINE's `validate_stat` to verify it on-chain, and winners claim from the pool. No bookmaker, no oracle multisig, no admin key.

Built for the [TxODDS World Cup Hackathon](https://superteam.fun/earn/hackathon/world-cup) — Prediction Markets and Settlement track. Full spec: [`PropChain-PRD-v1.1.md`](../PropChain-PRD-v1.1.md).

## How settlement works (two-phase, challenge-based)

1. **propose_settlement** — permissionless. Caller supplies a TxLINE stat-validation proof; the program builds the bet's predicate from immutable on-chain config and CPIs into TxLINE's `validate_stat` (devnet program `6pW64…yP2J`). Result becomes *pending*.
2. **Challenge window (90 min)** — anyone with a proof carrying a strictly later event timestamp can overturn the pending result. Latest proof wins: premature mid-match settlements and VAR corrections are both handled with zero trust assumptions.
3. **finalize_settlement** — after the window, the result locks. If the winning side has no stake, the bet voids and everyone reclaims.
4. **claim** — pull-based payouts: `stake × pool / winning_side_total`. Unsettled bets void permissionlessly 48 h after kickoff; stakes are never locked.

## Repo layout

| Path | What |
|---|---|
| `programs/propchain` | Anchor program: bet lifecycle, USDC escrow, CPI settlement |
| `app/` | Next.js frontend — pure UI over the server API (no wallet code in the browser) |
| `keeper/` | Watches TxLINE SSE, records feeds, proposes/challenges settlements |
| `server/` | NestJS API — server-side Privy wallets (create/sign/send), auto-funding, bet endpoints |
| `packages/txline` | Standalone TxLINE TS client (auth, REST, SSE, proof→instruction args) |
| `idls/` | TxLINE txoracle IDL (devnet) consumed via `declare_program!` |
| `recordings/` | JSONL feed recordings for deterministic replay in tests & demos |

## Quickstart

```bash
npm install

# program (needs Solana platform-tools >= 1.53)
anchor build
anchor test --provider.cluster localnet

# services
npm run keeper   # authenticates against TxLINE devnet, records the scores stream
npm run server   # NestJS API on :8899 — sessions, bets, stakes, claims (wallets signed server-side)

# app
cd app && npm run dev
```

Copy `.env.example` to `.env` and fill in what you need. Keeper and funder generate their own keypairs on first run — fund them with devnet SOL.

## Status

- [x] `validateStat` CPI proven on devnet (~173K CU, real World Cup semifinal data)
- [x] Program: `create_bet`, `place_stake` + tests
- [ ] Program: `propose_settlement`, `finalize_settlement`, `void_bet`, `claim`
- [ ] Keeper: settlement loop (record-only today)
- [ ] App: onboarding, bet builder, dashboard, proof viewer, claim
