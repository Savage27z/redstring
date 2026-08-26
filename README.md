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
