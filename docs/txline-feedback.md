# Our experience with the TxLINE API

*Draft answer for the submission's feedback question, written from notes kept
during the build.*

## What we loved

- **The Merkle-proof design is the real product.** `stat-validation` proofs +
  a CPI-able `validate_stat` let us build settlement where our own operator
  provably cannot lie — that's not possible on any other sports feed we know
  of. The CPI costs only ~173K CU, leaving plenty of headroom to do transfers
  and state updates in the same transaction.
- **Devnet parity.** Daily-roots PDAs for real World Cup fixtures exist on
  devnet, so a full trustless product can be built and judged without mainnet
  funds. This mattered more than anything else for velocity.
- **Demargined StablePrice.** `Pct` on `TXLineStablePriceDemargined` rows is
  directly usable as a probability — no vig arithmetic on our side.
- The guest-JWT → on-chain `subscribe` → token-activation flow is a genuinely
  clever auth design (the API key is itself proven on-chain).

## Friction we hit (with repro details)

1. **`GameState` is unreliable; the real phase lives elsewhere.** On the
   devnet scores feed `GameState` said `"scheduled"` for every event of every
   match, including finished ones (13k+ recorded events, only value ever
   seen). The actual phase is `StatusId` on score events and the
   period-encoding on stat keys — but the mapping (1 NS, 2 H1, 3 HT, 4 H2,
   5 F, 6–13 ET/pens, 15 A, 16 C, 19 P, 100 game_finalised, 0 post-final) had
   to be reverse-engineered from recordings plus the soccer-feed docs page.
   Suggestion: document the table next to the scores API and deprecate or fix
   `GameState`.
2. **Timestamp units are mixed.** Fixture `StartTime` and event `Ts` are
   milliseconds; other surfaces use seconds. We shipped a bug from this.
   Consistent units (or suffixed field names like `TsMs`) would prevent it.
3. **`subscribe` has undocumented preconditions.** `weeks` must be a multiple
   of 4, and the subscriber's TxL Token-2022 ATA must already exist or the
   instruction fails — we now create it idempotently in the same transaction.
   Neither is in the docs.
4. **Activation message format is easy to get wrong.** The exact
   `` `${txSig}::${jwt}` `` base64+nacl signing recipe took trial and error —
   a copy-pasteable example per SDK language would help.
5. **Snapshot vs proof timing.** Roots are published per ~5-minute interval
   inside the daily PDA, so proofs for an event can lag the event slightly.
   Fine in practice, but worth stating explicitly — we designed a challenge
   window partly because we couldn't find a documented guarantee.
6. **Odds coverage on the devnet World Cup tier** is 1X2, over/under goals and
   Asian handicap only — no corners/cards/BTTS consensus, though those stats
   are provable via score proofs. Even a coarse consensus for the provable
   stats would let prediction markets price every market they can settle.
7. Small ergonomics: PascalCase fields (`FixtureId`, `Seq`) surprise JS
   tooling; scores snapshots return a bare event array while other endpoints
   return objects; SSE `id:` lines would let clients resume with
   `Last-Event-ID` after a disconnect.

## What we built on it

Every one of these was still worth working through: we ended up using six REST
endpoints, the SSE stream, and both on-chain instructions, and the proof
pipeline settled real bets autonomously during live semifinals. The feed's
verifiability is the reason our product can exist.
