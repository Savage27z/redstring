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
