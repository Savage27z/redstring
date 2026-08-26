# redstring.lol

A pay-to-rank detective corkboard, rendered in three.js. Every submission is a
case file pinned to a corkboard on an easel, and **your card's size is your
share of all money on the board**. Outbid someone and the whole board reflows,
live, for everyone watching.

The red string is the point: a web of twine strung pin to pin across the cork,
with the runner-up tied straight to whoever holds #1.

```bash
npm install
npm run dev
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
| Data | `src/lib/store.ts` | In-memory by default; SQL swap marked |
| Realtime | `src/app/api/stream/route.ts` | SSE + polling fallback |
| Payment | `src/app/api/checkout/route.ts` | Stripe Checkout; dev mode without keys |

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

1. **Payments.** Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Checkout
   refuses to run in production without them. The webhook at
   `/api/webhooks/stripe` is the *only* thing that mutates the board — the
   success URL is not proof of payment, anyone can type it.

   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

2. **Persistence.** Run `schema.sql`, set `DATABASE_URL`, and replace the four
   functions marked `TODO (persistence)` in `src/lib/store.ts`. Signatures are
   unchanged. Note the `stripe_session UNIQUE` constraint — Stripe redelivers
   webhooks on any non-2xx, and without it a flaky deploy double-counts bids.

3. **Realtime across instances.** `src/lib/bus.ts` is in-process, so it only
   broadcasts to viewers on the same node. Swap it for Redis pub/sub or Supabase
   Realtime — it's two functions, `subscribe` and `publish`.

### Known gaps

- **Race at checkout.** If someone is outbid while their Stripe Checkout tab is
  open, the payment captures but the slot is gone. The webhook logs
  `needsRefund: true`; wire that to a refund job before taking real money.
- **Visitor count** is a server counter, not unique visitors.
- **No moderation.** Anything paid goes straight onto the board. Add review
  (`status: 'pending'` already exists in the schema for this) before launch.
- **Cards can visually clip.** Placement guarantees no overlap in board space,
  but per-card tilt plus perspective lets corners cross. It reads as pinned
  paper, so it's left alone.

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
