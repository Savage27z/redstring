# redstring.lol

A pay-to-rank detective corkboard, rendered in three.js. Every submission is a
case file pinned to a corkboard on an easel, and **your card's size is your
share of all money on the board**. Outbid someone and the whole board reflows,
live, for everyone watching.

The red string is the point: a web of twine strung pin to pin across the cork,
with the runner-up tied straight to whoever holds #1.

```bash
npm install
npm run dev     # board at http://localhost:3000
npm test        # layout invariants
npm run lint    # eslint
npm run smoke   # end-to-end API checks against a running dev server
```

Open http://localhost:3000. No `.env` needed — the board runs in memory and
applies bids without payment, so the full **outbid → reflow → realtime** loop
works from a clean clone.

## The mechanic

`src/lib/scatter.ts` sizes and places every card.

- **Size is strictly ranked by bid.** #1 is always visibly the biggest, #2 next,
  all the way down. Area follows `share^0.62` rather than raw share: still
  strictly monotonic, but it keeps a $2 bid from rendering sub-pixel next to a
  $12,000 one.
- **Position is deliberately unordered.** A treemap packs the board edge to edge
  in reading order, which looks like a dashboard, not evidence. Cards are
  scattered instead — candidate positions scored for crowding, then relaxed
  apart — so you read importance from size, not from position. Placement is
  seeded from the submission id, so the board looks hand-pinned but never
  reshuffles between reloads.

Verified in `scatter.test.mjs`: sizes strictly ordered by bid, zero overlapping
cards, everything inside the cork, deterministic under input order, placement
genuinely unordered, and stable at 60 cards.

## Architecture

| Concern | Where | Notes |
| --- | --- | --- |
| Size + placement | `src/lib/scatter.ts` | Pure, no deps, no React |
| Card artwork | `src/lib/cardTexture.ts` | Canvas 2D → texture per card |
| Scene, camera, lights | `src/components/three/BoardScene.tsx` | |
| Cork + wooden frame | `src/components/three/Wall.tsx` | Generated textures |
| Easel | `src/components/three/Easel.tsx` | Struts spanning two points |
| Reflow tween | `src/components/three/boardTween.ts` | One writer, many readers |
| The string | `src/components/three/StringWeb.tsx` | Prim's MST, swept tubes |
| Validation | `src/lib/validation.ts` | Every limit, enforced before payment |
| Data | `src/lib/store.ts` | Async; Postgres when `DATABASE_URL` is set |
| Storage adapters | `src/lib/db/` | `memory.ts` (default), `postgres.ts` |
| Rate limiting | `src/lib/rateLimit.ts` | In-process fixed window |
| Realtime | `src/app/api/stream/route.ts` | SSE + polling fallback |
| Payment | `src/lib/payments/` | USDC on Solana + Base; dev mode with no chain set |

### Three decisions worth knowing

**The tween is not React state.** Re-rendering the tree every frame would
reconcile every card and every strand at 60fps. Instead one `useFrame`
(priority `-10`) advances a mutable store, and cards and string both *read* it
during their own frame callbacks. One writer, many readers — which is also what
guarantees the string stays welded to its pins mid-reflow instead of visibly
detaching from the cards it is tied to.

**Textures are drawn at settled size, and the mesh is scaled.** Each card is a
unit quad scaled into place, so a reflow is pure transform work and never
redraws a canvas. Sizes are bucketed so window resizes don't thrash the cache.

**The string is a minimum spanning tree.** Spoking every contender back to #1
produced a starburst of long strands crossing the middle of the board, burying
the cards. Prim's rooted at #1 gives short hops and few crossings — a web, the
way a real board is strung — plus one deliberate long strand from the runner-up
to #1.

## Going to production

1. **Payments (USDC).** Bids settle in USDC on **Solana**, **Base**, or both.
   USDC is a dollar stablecoin, so a $12 bid is 12 USDC — no price oracle and no
   volatility window. Set `SOLANA_RECIPIENT` and/or `BASE_RECIPIENT` to the
   wallets that should receive funds; a rail stays off until its address is set.
   `CRYPTO_NETWORK` defaults to `testnet` (Solana devnet, Base Sepolia), so
   taking real money is a deliberate act.

   Nothing reaches the board until the chain confirms:

   - `POST /api/checkout` validates the bid, fixes the price server-side, and
     opens a *payment intent*. No submission is created yet.
   - **Solana** uses Solana Pay. The request carries a throwaway `reference`
     public key, so the server finds and validates that exact transfer itself —
     the payer reports nothing, and no wallet library ships to the browser. The
     QR is rendered server-side.
   - **Base** has no equivalent, so the injected wallet sends calldata the
     server built and returns a transaction hash. That hash is only a hint: the
     server re-reads the receipt and requires a `Transfer` event from the real
     USDC contract, to our address, for at least the requested amount.
   - The transaction signature becomes `paymentRef`, so the existing
     idempotency applies — polling twice or replaying a hash cannot double-bid.

   Public RPCs are heavily rate limited and the poll loop hits them per viewer;
   use Helius/QuickNode/Alchemy via `SOLANA_RPC_URL` / `BASE_RPC_URL` for
   anything real.

   `npm run smoke` covers both rails: intents open, unpaid bids never reach the
   board, and forged transaction hashes settle nothing.

2. **Persistence.** Run `schema.sql`, set `DATABASE_URL`, and the Postgres
   adapter takes over automatically — no code change. Verify the wiring with:

   ```bash
   DATABASE_URL=postgres://... npm run db:check
   ```

   `commitBid` runs the floor check and both writes in one transaction with
   `SELECT ... FOR UPDATE` on the submission row, so two people bidding on the
   same slot at the same moment cannot both win.

   > The Postgres adapter has not been exercised against a live database —
   > `npm run db:check` plus one test bid is worth doing before launch.

3. **Realtime across instances.** `src/lib/bus.ts` is in-process, so it only
   broadcasts to viewers on the same node. `src/lib/rateLimit.ts` has the same
   limitation. Behind more than one node, move both to Redis.

## On accounts, and card payments

There is deliberately no signup. The board is an impulse purchase, and a signup
wall sits directly between wanting the top slot and paying for it. On-chain, the
transaction *is* the identity of record — `bidder_name` is only a display label
on the card and is spoofable by design.

`schema.sql` carries a nullable `owner_id` on `submissions` and `bid_history` if
you ever add accounts; populate it from the session and treat `bidder_name` as
cosmetic. If you do add auth middleware, `/api/board`, `/api/stream` and
`/api/payments/*` must stay public or the board stops working for visitors.

**Card payments** were built on Polar (merchant of record, which works from
Nigeria where Stripe does not) and Polar's automated review rejected the model:
paid-ranking boards are non-compliant under their AUP. The webhook handler at
`src/app/api/webhooks/polar/route.ts` is left intact and dormant — it does
nothing without `POLAR_WEBHOOK_SECRET`. If Polar ever approves the use case, or
you move to another processor, restoring cards means re-adding the provider
branch to `/api/checkout`; the store, validation and idempotency underneath are
payment-agnostic already.

### Known gaps

- **Race at checkout.** If someone is outbid while their Polar checkout is
  open, the payment goes through but the slot is gone. The webhook logs
  `needsRefund: true`; wire that to a refund job before taking real money.
- **No moderation.** Anything paid goes straight onto the board. URLs are
  validated as well-formed http(s), which is not the same as trustworthy —
  `status: 'pending'` exists in the schema for a review step.
- **Visitor count** is total stream connections, not unique visitors.

## Design notes

Cork, wood grain, and every card face are drawn to canvas at runtime — no image
requests, and they stay sharp at any size. Stock varies by rank the way a real
board does: instant photos with a deep green field for the top bids, yellow
sticky notes and ruled notepaper below, bare scraps at the bottom. Pins are
chrome except the prime suspect's, which is red — if a third of the board is
red it stops meaning anything.

Type is **Special Elite** (case notes, stamps, figures) against **Archivo**
(body copy).

Reduced motion is honored: the reflow snaps instead of tweening, the pin-drop
and camera parallax are disabled, and DOM transitions collapse to 120ms.

## Not built yet

- **Crypto escrow** (USDC auto-refund for outbid parties) — v2, flagged as such.
- **Logo upload.** `logoUrl` is carried through the schema and the store but is
  not rendered on the card yet, and there is no upload path.
