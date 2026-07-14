# PropChain

**Parametric prop bets on Solana, settled trustlessly by TxLINE's on-chain-verified World Cup data.**

Create a prop bet ("total corners in France–Spain over 9.5"), stake pUSDC on either side, and let cryptography settle it: anyone can submit a TxLINE Merkle proof, our program CPIs into TxLINE's `validate_stat` to verify it on-chain, and winners claim from the pool. No bookmaker, no oracle multisig, no admin key — **the operator cannot fabricate an outcome, and any wrong result can be overturned by a better proof during the challenge window.**

Built for the [TxODDS World Cup Hackathon](https://superteam.fun/earn/hackathon/world-cup) — **Prediction Markets and Settlement track**.

- Program (devnet): [`3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU`](https://explorer.solana.com/address/3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU?cluster=devnet)
- TxLINE oracle it verifies against (devnet): [`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`](https://explorer.solana.com/address/6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J?cluster=devnet)
- Stake mint: pUSDC (mock USDC we mint on devnet) `DWF9ARTjTq3S2jMabyimsaXiVqGVHnVdp1XoRAh3s6Q8` — auto-dripped to every new account, so testing costs nothing.

## Trying it in 60 seconds (judges)

1. Open the app, browse the board signed out — every market, odds meter, and settled proof is public.
2. Tap any stake button → sign in with just a name and email. A server-side wallet is created and auto-funded (0.05 SOL + 100 pUSDC). Stake.
3. Tap any **settled** market → "Verify it yourself": the Merkle proof, the settlement transaction, and the CPI into TxLINE's verifier, each linked to the Explorer.
4. **No match on?** Press **"▶ Watch a live settlement"**: a real on-chain bet is opened against a real finished World Cup fixture, time-shifted two minutes ahead; recorded TxLINE scores replay live, and the autonomous keeper settles it before your eyes with the fixture's *real* Merkle proof. Nothing is simulated except the clock.

## How settlement works (two-phase, challenge-based)

1. **propose_settlement** — permissionless. Caller supplies a TxLINE stat-validation proof; the program builds the bet's predicate from immutable on-chain config and CPIs into TxLINE's `validate_stat`. Proofs are only accepted from final match phases (`period ∈ {100, 0}` — `game_finalised`/post-final), so mid-match settlement is impossible by construction. Result becomes *pending*.
2. **Challenge window (90 min)** — anyone with a proof carrying a strictly later event timestamp can overturn the pending result. Latest proof wins: post-final corrections (VAR, amended stats) are handled with zero trust assumptions.
3. **finalize_settlement** — after the window, the result locks. If the winning side has no stake, the bet voids and everyone reclaims. Exact-line results ("push") go to Under by the strict-greater rule; the UI only ever shows half-lines (threshold 9 renders as 9.5) so no user-facing market can push.
4. **claim** — pull-based payouts: `stake × pool / winning_side_total`. Unsettled bets void permissionlessly 48 h after kickoff; stakes are never locked. 7 days later the creator may `sweep` residual dust and reclaim the vault's rent — gated so it can never front-run a winner's claim.

The keeper that runs this autonomously holds **no authority**: every instruction is permissionless or creator-gated, and anyone can run a competing keeper with their own proofs.

## TxLINE integration (endpoints used)

| Endpoint | Used for | Where |
|---|---|---|
| `POST /auth/guest/start` | guest JWT bootstrap | `packages/txline` |
| on-chain `subscribe` + `POST /api/token/activate` | API token (fee-waived hackathon tier) | `packages/txline` |
| `GET /api/fixtures/snapshot?startEpochDay=` | fixture list, board, persistent archive | `server/fixtures` |
| `GET /api/scores/snapshot/{fixtureId}?asOf=` | live scorelines + settlement snapshots | `server/fixtures`, `keeper` |
| `GET /api/scores/stat-validation?fixtureId=&seq=&statKey=[&statKey2=]` | Merkle proofs for settlement | `keeper` |
| `GET /api/scores/stream` (SSE) | live feed recording + settlement triggers | `keeper` |
| `GET /api/odds/snapshot/{fixtureId}` | StablePrice consensus vs pool-implied odds on cards | `server/odds` |
| on-chain `validate_stat` (CPI) | the settlement verdict itself | `programs/propchain` |

## Repo layout

| Path | What |
|---|---|
| `programs/propchain` | Anchor program: bet lifecycle, pUSDC escrow, two-phase CPI settlement |
| `app/` | Next.js frontend — pure UI over the server API (no wallet code in the browser) |
| `keeper/` | Watches TxLINE SSE, records feeds, routes match phases, proposes/challenges/finalizes/voids |
| `server/` | NestJS API — server-side wallets (Privy or local dev), auth, funding, bets, odds, replay demo |
| `packages/txline` | Standalone TxLINE TS client (auth, REST, hardened SSE, proof→instruction args) |
| `idls/` | TxLINE txoracle IDL (devnet) consumed via `declare_program!` |
| `recordings/` | JSONL feed recordings for deterministic replay in tests & the live-settlement demo |

## Quickstart

```bash
npm install

# program (needs Solana platform-tools >= 1.53)
anchor build
anchor test --provider.cluster localnet   # 6 validator tests
npm run test:settlement                   # 15 bankrun tests: real oracle binary, real Merkle proofs

# services
npm run keeper   # authenticates against TxLINE devnet, records + settles autonomously
npm run server   # NestJS API on :8899 — sessions, bets, stakes, claims, odds, demo replay
npm test -w keeper && npm test -w server  # phase-routing + replay unit tests

# app
cd app && npm run dev
```

Copy `server/.env.example` to `server/.env` and fill in what you need — everything has a dev fallback. Keeper and funder generate their own keypairs on first run; fund them with devnet SOL.

## Test coverage

- **15 bankrun settlement tests** run against the *real* txoracle binary dumped from devnet, the *real* daily-roots account, and three *real* France–Morocco Merkle proofs: lifecycle with challenge replacement, mid-match proof rejection, the push rule, zero-winner voids, timelocks, stat/fixture binding, mint allowlist, sweep gates.
- 6 validator tests for bet creation/staking edges, 10 keeper phase-routing tests, 6 replay-timeline tests.
