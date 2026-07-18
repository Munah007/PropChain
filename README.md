<div align="center">
  <img src="app/public/logo-mark.png" alt="PropChain" width="96" />

  # PropChain

  **Prop bets on the World Cup, settled by proof — not by a bookmaker.**

  Peer-to-peer prediction markets on Solana where every result is decided by a
  cryptographic proof of the real match data. No house, no admin key, no operator
  who could fake an outcome.

  Built for the [TxODDS × Solana World Cup Hackathon](https://superteam.fun/earn/hackathon/world-cup) · Prediction Markets & Settlement track.

  `devnet` · `Anchor` · `Next.js` · `TxLINE Merkle proofs`
</div>

---

## The problem

Every time you bet on football, you trust the house to do two things: tell you the
truth about what happened, and actually pay you. You never see how they settled it —
you just hope.

PropChain removes that trust. You stake into an on-chain escrow no one can touch, and
when the match ends the result is proven, not declared. Anyone can verify the
settlement themselves on the blockchain.

**Settled by proof, not promises.**

---

## How it works, in one picture

```
  You                 PropChain (Solana)              TxLINE (data layer)
  ───                 ──────────────────              ───────────────────
  sign in (email)  →  server wallet created + funded
  pick a market    →  create_bet  (escrow PDA)
  stake a side     →  place_stake (pUSDC → vault)
                          │
   ⚽ match ends          │  keeper watches the feed  ←──  live scores (SSE)
                          ▼                                Merkle proof (stat-validation)
                     propose_settlement ── CPI ──→ validate_stat  ✅ verified on-chain
                          │  90-min challenge window (a later proof can overturn)
                          ▼
                     finalize_settlement
  tap Claim        →  claim  (vault → your wallet)
```

The keeper holds **no authority**. Every instruction is permissionless or
creator-gated — anyone can run their own keeper, and no key anywhere can decide a
result. The program only ever accepts a **proof**, never a claim.

---

## What's inside

| | Feature | What it does |
|---|---|---|
| 🎯 | **23 prop markets** | Match winner, margins, both-teams-to-score, total/team goals, corners, cards, clean sheets — all from TxLINE's provable stats. |
| 🔗 | **Proof-based settlement** | A two-phase settle (propose → challenge → finalize) that CPIs into TxLINE's `validate_stat`. The operator can't fabricate a result; a later proof can overturn a wrong one. |
| 🔎 | **"Verify it yourself"** | Every settled bet links the Merkle proof, the settlement tx, and TxLINE's verifier program on the Solana Explorer. |
| 📈 | **Signals** | Every open market priced against the World Cup we recorded — 78 real finals replayed through the market's own on-chain predicate — next to what the pool is paying. The gap is the edge. |
| 🧾 | **Track record** | A public ledger of every result the protocol ever produced, each with its Merkle proof and settlement tx. The proved count equals the settled count because no other settlement path exists. |
| 🛡️ | **The 12th Man agent** | An autonomous agent that *defends your team*: auto-backs them whenever someone bets against them, from your wallet, within your limits. |
| ▶️ | **Watch a live settlement** | Replays a real finished match on demand so you can watch the keeper settle a bet with a real proof — even after the tournament ends. |
| ✉️ | **Email login, no seed phrase** | Sign in with an email; a Solana wallet is created and funded server-side. Crypto rails, consumer feel. |

---

## The 12th Man — a loyalty agent

The feature people remember. You name your team (a nation, or a club — the picker is
searchable by team or league), set a min/max stake and a daily cap, and switch it on.

From then on the agent watches the board and, whenever a market goes against your
team, it **automatically takes the pro-team side for you** — signing from your own
wallet. Two modes: *answer doubters* (only when someone bets against you) or *back
every market*. It knows which side actually favors your team per market (goals and
corners are good, cards are bad, home vs away handled).

Because wallets are custodial server-side, it's a real autonomous on-chain bettor —
not a suggestion engine. Every bet it places is yours, badged in your history.

---

## How settlement works (the part that matters)

1. **`propose_settlement`** — permissionless. The caller supplies a TxLINE
   stat-validation proof; the program builds the bet's predicate from its own
   immutable config and CPIs into TxLINE's `validate_stat` to verify it on-chain.
   Proofs are only accepted from final match phases, so mid-game state can never
   settle a bet.
2. **Challenge window (90 min)** — anyone with a proof carrying a strictly later
   event timestamp can overturn the pending result. Post-full-time corrections (VAR,
   amended stats) can't lock in a wrong payout. Latest valid proof wins.
3. **`finalize_settlement`** — after the window, the result locks. If the winning
   side had no stake, the bet voids and everyone reclaims.
4. **`claim`** — pull-based payout: `stake × pool ÷ winning-side total`. Unsettled
   bets void permissionlessly 48h after kickoff, so funds are never stranded.

Edge cases were designed first — that's where betting protocols actually break:
zero-winner voids, exact-line push rules, abandoned/postponed matches, and a
strictly-monotonic proof-timestamp rule for challenges.

---

## Signals — pricing from the tournament we recorded

TxLINE's StablePrice feed goes quiet once the tournament ends, so a consensus
line that reads "—" is all anyone would see after the final. Rather than invent
a goals model, we price from the one dataset that is genuinely ours: **the World
Cup our own keeper recorded**, archived as final scores.

The method is deliberately dumb and fully auditable. For each open market we take
its **exact on-chain predicate** — the same stat keys, operator, comparison and
strict inequality that `validate_stat` will settle it with — and replay it across
every recorded final. The share that came in is the fair value:

```
over 2.5 goals  59.0%     BTTS       51.3%     n = 78 recorded finals
home win        48.7%     avg goals   2.88
```

Against that we set the **pool-implied** probability, which for a parimutuel pool
is just the over side's share of the pot. Where they diverge, one of them is
wrong, and the gap is the signal. We take no view on which is wrong.

**What we deliberately don't price.** The archive holds scorelines, not stat
sheets — full `Stats` frames exist for four fixtures, which is not a sample. So
anything touching corners or cards returns `unpriced`, with the reason shown in
the UI, rather than a number we couldn't defend. `server/src/pricing/` is pure and
unit-tested; `predicate.ts` is a deliberate mirror of the Rust predicate, and the
tests exist to keep the two from drifting.

---

## Architecture

A TypeScript + Rust monorepo:

| Path | What |
|---|---|
| `programs/propchain` | Anchor program — bet lifecycle, pUSDC escrow, two-phase CPI settlement, creator sweep. |
| `app/` | Next.js 14 frontend — mobile-first board, bet flow, proof viewer, 12th Man, Claim/Account. Pure UI; no keys in the browser. |
| `server/` | NestJS API — server-managed wallets (Privy or local dev), email sessions, betting, odds, signals + track record, the agent engine, replay demo. |
| `keeper/` | Watches the TxLINE feed, records it, routes match phases, and autonomously proposes / challenges / finalizes / voids. |
| `packages/txline` | Standalone TxLINE client — auth, REST, hardened SSE, proof → instruction args. Reusable SDK. |
| `idls/` | TxLINE oracle IDL, consumed on-chain via `declare_program!`. |

**Stack:** Anchor 0.31 · Solana · Next.js 14 + Tailwind · NestJS · Privy (server wallets) · TxLINE.

---

## TxLINE integration

TxLINE is the whole reason this works — it exposes match data as **verifiable
on-chain proofs**, not just a REST API you have to trust.

| Endpoint | Used for |
|---|---|
| `POST /auth/guest/start` + on-chain `subscribe` + `POST /api/token/activate` | Auth (fee-waived hackathon tier) |
| `GET /api/fixtures/snapshot` | Fixtures, board, persistent archive |
| `GET /api/scores/snapshot/{id}` | Live scorelines + settlement snapshots |
| `GET /api/scores/stat-validation` | The Merkle proofs that settle bets |
| `GET /api/scores/stream` (SSE) | Live feed recording + settlement triggers |
| `GET /api/odds/snapshot/{id}` | StablePrice consensus odds on cards |
| on-chain `validate_stat` (CPI) | The settlement verdict itself |

---

## Try it in 60 seconds

1. Open the app and browse the board signed out — every market, odds meter, and
   settled proof is public.
2. Tap a stake button → sign in with just an email → you get a wallet funded with
   100 pUSDC. Stake.
3. Open any **settled** market → **Verify it yourself** → click through the proof and
   TxLINE's verifier program on the Explorer. Or open **Track record** for the whole
   ledger at once — every result the protocol ever produced, each with its proof.
4. Open **Signals** to see where the pool disagrees with the recorded base rate,
   and why.
5. No live match? Hit **▶ Watch a live settlement** and watch a real bet settle with a
   real proof in ~2 minutes.

**Live app:** <https://propchain-production.up.railway.app> · **API:** <https://propchainserver-production.up.railway.app> · **Demo video:** [add link]

### Deployed on devnet

- Program — [`3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU`](https://explorer.solana.com/address/3HwBzjvoM663GwMSveXdNNFVaQ4JdNxQAyAxEdZv7MJU?cluster=devnet)
- TxLINE oracle it verifies against — [`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`](https://explorer.solana.com/address/6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J?cluster=devnet)
- Stake mint (mock USDC we mint) — `DWF9ARTjTq3S2jMabyimsaXiVqGVHnVdp1XoRAh3s6Q8`

---

## Run it locally

```bash
npm install

# program (needs Solana platform-tools >= 1.53)
anchor build
anchor test --provider.cluster localnet   # 6 validator tests
npm run test:settlement                    # 15 bankrun tests — real oracle binary + real Merkle proofs

# services
npm run keeper    # authenticates against TxLINE devnet, records + settles autonomously
npm run server    # NestJS API on :8899

# app
cd app && NEXT_PUBLIC_API_URL=http://localhost:8899 npm run dev
```

Copy `server/.env.example` to `server/.env` — everything has a dev fallback. See
[`DEPLOY.md`](DEPLOY.md) for production (persistent volume for accounts, env vars).

### Tests

- **15 bankrun settlement tests** run against the *real* TxLINE oracle binary and
  *real* World Cup Merkle proofs — lifecycle, challenge replacement, mid-match
  rejection, push rule, zero-winner voids, timelocks, mint allowlist, sweep.
- 6 validator tests, 10 keeper phase-routing tests, server + agent unit tests.

---

## What's next

The World Cup was the excuse; the idea is bigger — any sport, any verifiable stat,
any market, settled by proof, with agents that trade and defend on your behalf.
Provable settlement + autonomous agents is where prediction markets should have
started.

---

<div align="center">
  <sub>Prop bets, settled by proof — not promises. Built for the TxODDS × Solana World Cup Hackathon.</sub>
</div>
