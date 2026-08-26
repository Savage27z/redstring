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
  strictly monotonic, but it keeps a $5 bid from rendering sub-pixel next to a
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
| Payment | `src/lib/payments.ts` | Polar (merchant of record); dev mode without keys |

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

1. **Payments (Polar).** Polar is the merchant of record, which is what makes
   this workable from Nigeria where Stripe is unavailable. Set
   `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID` and `POLAR_WEBHOOK_SECRET`;
   checkout refuses to run in production without them, and `POLAR_SERVER`
   defaults to `sandbox` so going live is deliberate.

   Create exactly **one** product in Polar. Its catalog price never applies:
   each checkout attaches a one-off fixed price equal to that bid, so the buyer
   cannot edit the amount (which pay-what-you-want pricing would allow).

   Point a webhook at `/api/webhooks/polar` subscribed to `order.paid`. That is
   the *only* thing that mutates the board — the success URL is not proof of
   payment, anyone can type it. The handler is idempotent on the Polar order id,
   so retries and duplicate deliveries cannot apply the same bid twice, and the
   amount credited comes from the order total rather than metadata.

   Signature verification is strict, but payload parsing is deliberately loose:
   the SDK's `validateEvent` also runs the body through a generated schema for
   the entire Order and rejects the event if any field drifts, which would mean
   a paid order silently never reaching the board after an unrelated Polar
   change. We verify the signature, then read only the fields we need.

   `npm run smoke` covers all of this — it signs a real Standard Webhooks
   payload locally and replays it.

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

## Adding auth

`bidder_name` is client-supplied today, so anyone can bid under any name. The
schema already carries a nullable `owner_id` on both `submissions` and
`bid_history` for this — populate it from the session and treat `bidder_name`
as a display label only.

Two things to get right:

- **Keep `/api/webhooks/polar` public.** Behind auth middleware Polar gets
  401s and payments silently stop applying. `/api/board` and `/api/stream` must
  stay public too, or the board won't render for logged-out visitors.
- **Link identity to payment** with `client_reference_id` on the Checkout
  session, so a completed payment maps back to an account.

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
