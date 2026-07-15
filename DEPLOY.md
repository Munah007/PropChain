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

The **keeper** (records feeds + settles) should run as its own always-on
process/service with its keypair funded on devnet.

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
- [ ] Keeper running and funded
- [ ] Smoke test as a stranger: create account → refresh/restart → log back in with the same email → same wallet, same balance
