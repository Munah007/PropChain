# Deploying PropChain

Two services deploy together — the **server** (NestJS API) and the **app**
(Next.js). They must ship as a pair: the new app sends an auth header the old
server rejects, and vice versa.

## ⚠️ The one that bites: persistent storage

Accounts, wallet keys, funding state, and agent config all live under
`DATA_DIR`. **It must point at a persistent volume**, or every restart/redeploy
wipes it — and returning users get brand-new wallets, losing their old accounts
and bets. This is the cause of "same email, different wallet each time."

On Railway:
1. Add a **Volume** to the server service, mount path e.g. `/data`.
2. Set env `DATA_DIR=/data`.
3. Redeploy. The server logs a warning at boot if `DATA_DIR` is unset.

## Server env (Railway service → Variables)

| Var | Value | Why |
|---|---|---|
| `DATA_DIR` | `/data` (a mounted volume) | **account durability — see above** |
| `CORS_ORIGINS` | your app URL, e.g. `https://propchain.up.railway.app` | lock down the API |
| `RECORDINGS_DIR` | path to shipped/mounted `recordings/` | replay demo needs the feeds |
| `FUNDER_SECRET` | funder keypair secret-key JSON array | faucet; keep off disk |
| `PUSDC_MINT` | `DWF9ARTjTq3S2jMabyimsaXiVqGVHnVdp1XoRAh3s6Q8` | reuse the existing mint |
| `RPC_URL` | a devnet RPC (default works) | chain access |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | optional | TEE-managed wallets + token auth |
| `AGENT_TICK_MS` | `20000` (or lower for demos) | 12th Man loop cadence |

## The keeper (its own service)

The keeper records feeds and settles bets. It talks to the server through
**nothing** — no HTTP, no queue. It writes to Solana; the server reads Solana
back. That decoupling is the point (`anyone can run this binary against the
public program`), so the keeper deploys as a service of its own.

**Root directory: the repo root — NOT `/keeper`.** `index.ts` resolves
`REPO_ROOT` two levels up from `keeper/src`, so a `/keeper` root makes it look
for `/idls/txoracle.json` and fail. It's also an npm workspace that depends on
`@propchain/txline`, which only resolves from the root `package.json`.

**Build it with `Dockerfile.keeper`, NOT Railpack.** The keeper is the only
service that depends on a *sibling* workspace (`@propchain/txline` at
`packages/txline`). Railpack's monorepo builder does not pull sibling workspaces
into a service's install layer, so `npm install` there sees `@propchain/txline`
as external and fails with `404 … @propchain/txline is not in this registry`.

The Dockerfile fixes that by installing from the repo root — but it **must live
at the repo root**, not in `keeper/`. Railway sets a Docker build's context to
the directory the Dockerfile lives in: a `keeper/Dockerfile` builds with context
`keeper/`, where there's no root `package.json`, so `npm install --workspace
@propchain/keeper` fails with `No workspaces found`. `Dockerfile.keeper` at the
root builds with the whole monorepo as context, so the workspace graph resolves.
Verified with a local `docker build` (txline symlinks, keeper runs past all
imports). Its non-default name means Railway won't auto-apply it to the `server`
service, which keeps using Railpack (it has no sibling-workspace dep).

| | |
|---|---|
| Root directory | repo root |
| Builder | Dockerfile — path `Dockerfile.keeper` (at the repo root) |
| Start command | `npm run keeper` (the Dockerfile `CMD`; leave the service's start command empty) |

### ⚠️ The one that bites here: it invents its own wallet

`keeper-keypair.json` and `txline-creds.json` are **gitignored**, so they are
never in the image. A missing keypair is not an error — `loadOrCreateKeypair`
**generates a fresh one** and logs `generated keypair … fund it with devnet SOL`.

On an ephemeral disk that means *every redeploy mints a new, unfunded keeper*.
It cannot pay transaction fees, so nothing settles — and the board doesn't look
broken, it just shows "Awaiting proof" forever on every finished match. Set
`KEEPER_SECRET` (same idea as the server's `FUNDER_SECRET`): it is checked
first and never touches disk.

### Keeper env

| Var | Value | Why |
|---|---|---|
| `KEEPER_SECRET` | keeper keypair secret-key JSON array | **or it silently settles nothing — see above** |
| `TXLINE_JWT` / `TXLINE_API_TOKEN` | activated TxLINE creds | `CREDS_PATH` has no env override; with these set the missing file is harmless |
| `RPC_URL` | a devnet RPC (default works) | chain access |
| `TXLINE_NETWORK` | `devnet` (default) | picks the TxLINE origin |
| `RECORDINGS_DIR` | a **mounted volume** | see below |
| `RECONCILE_INTERVAL_MS` | `30000` (default) | settlement tick |

### Recordings are a deadline-shaped risk

The keeper writes every feed event to `RECORDINGS_DIR` — "our demo/test
lifeline once the tournament (and the free data) ends Jul 19." On ephemeral
disk each redeploy throws away whatever it captured, including the semis and
the final. Mount a volume, or pull the files down and commit them before the
19th. (The server's `RECORDINGS_DIR` is a separate shipped copy for the replay
demo; the two services never share a directory.)

### Don't run the supervisor on Railway

`npm run keeper:watch` (`keeper/supervise.sh`) restarts the keeper on exit.
Railway already restarts a crashed container, and putting the supervisor in
front of it means the platform sees a permanently "up" service while the keeper
crash-loops invisibly inside — turning a visible failure into a silent one, the
exact thing that makes a dead keeper expensive. Use `npm run keeper` here and
let the platform supervise. `keeper:watch` is for a laptop or a bare VM, where
nothing else is watching.

### Smoke test

Logs should show `TxLINE credentials ready (devnet)` and `settlement engine
armed`, **and must NOT show** `generated keypair … fund it with devnet SOL`.
That line means it is running as a stranger with an empty wallet.

## App env (build time)

| Var | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the **https** server URL (baked at build — rebuild if it changes) |

## Recovering a lost account (Privy deploys)

With Privy configured, wallet **keys never touch the server** — they live in
Privy. If an ephemeral-disk wipe lost the email→wallet mapping, the funds/bets
are still safe on-chain; you just re-link the email. The account file record is:

```json
{ "<email>": { "walletId": "<privy wallet id>", "address": "<solana address>", "name": "<name>" } }
```

1. **Find the wallet ID** for the address — either in the Privy dashboard
   (Wallets → search the address → copy its ID), or run, with the same Privy
   credentials the deploy uses:
   ```bash
   PRIVY_APP_ID=... PRIVY_APP_SECRET=... \
   node server/scripts/recover-wallet.mjs <solana-address> <email> [name]
   ```
   It prints the exact `RECOVER_USERS` value.
2. On Railway, set env `RECOVER_USERS` to that JSON (and make sure `DATA_DIR`
   points at a mounted volume — see above).
3. Redeploy once. On boot the server logs `recovered N account(s)` and writes
   the mapping into the persistent volume. Log in with that email → same wallet.
4. Remove `RECOVER_USERS` afterwards (optional — it only fills gaps, never
   overwrites, so leaving it is harmless).

## Deploy checklist

- [ ] Latest code deployed (verify the redesigned board + email-first sign-in are live)
- [ ] Server volume mounted, `DATA_DIR` set to it
- [ ] `NEXT_PUBLIC_API_URL` is the https server URL
- [ ] `CORS_ORIGINS` = the app origin
- [ ] Funder wallet funded with devnet SOL; `PUSDC_MINT` set
- [ ] Keeper service: root = repo root, start = `npm run keeper`
- [ ] `KEEPER_SECRET` set and that wallet funded — check the logs for
      `generated keypair … fund it`, which means it isn't
- [ ] Keeper `RECORDINGS_DIR` on a volume (or recordings pulled + committed
      before the free feed ends Jul 19)
- [ ] Smoke test as a stranger: create account → refresh/restart → log back in with the same email → same wallet, same balance
