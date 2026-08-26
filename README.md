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
