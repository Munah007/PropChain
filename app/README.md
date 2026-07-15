# PropChain — frontend

Next.js 14 app. Pure UI over the PropChain server API: no wallet code, no keys,
no direct TxLINE calls in the browser.

```bash
npm install
NEXT_PUBLIC_API_URL=http://localhost:8899 npm run dev
```

`NEXT_PUBLIC_API_URL` is baked at build time — point it at the deployed API
(https) for production builds.

Highlights worth reading: `src/lib/format.ts` (market templates, side labels,
consensus/pool-implied odds mapping), `src/components/BetDetailSheet.tsx`
(settlement timeline + Merkle-proof viewer), `src/components/DemoBanner.tsx`
(replayed live-settlement demo for the post-tournament review window).

See the [repo root README](../README.md) for the full architecture.
