import Board from '@/components/Board';
import { getBoardState } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Home() {
  // The visitor counter lives in the SSE route, not here: mutating a counter
  // during a server render is a side effect in render, and it counted crawlers
  // and prefetches as viewers.
  const initial = await getBoardState();

  return (
    <>
      <Board initial={initial} />

      {/* The pitch lives below the fold: the board has to do the selling. */}
      <footer className="border-t border-[rgba(235,235,240,0.12)] bg-[#232326] px-5 py-10">
        <div className="mx-auto grid max-w-[1100px] gap-8 sm:grid-cols-3">
          <div>
            <h2 className="font-[family-name:var(--font-case)] text-lg text-[color:var(--color-paper)]">
              How the board works
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[rgba(239,230,210,0.6)]">
              Every case file&rsquo;s area is its share of all money on the board. Bid
              $500 against a $500 board and you own half the wall. Outbid someone
              and every card resizes around you, live, for everyone watching.
            </p>
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-case)] text-lg text-[color:var(--color-paper)]">
              The red string
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[rgba(239,230,210,0.6)]">
              Runs from the top contenders straight to whoever&rsquo;s holding #1.
              When you take the top slot, the string redraws itself to point at
              you. That is the whole point of the site.
            </p>
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-case)] text-lg text-[color:var(--color-paper)]">
              House rules
            </h2>
            <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-[rgba(239,230,210,0.6)]">
              <li>· $5 minimum to get pinned. No ceiling.</li>
              <li>· Bids are placements, not refunds.</li>
              <li>· Beat the standing bid by $1 to take a slot.</li>
              <li>· No illegal, hateful, or malware listings.</li>
            </ul>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-[1100px] font-[family-name:var(--font-case)] text-[11px] uppercase tracking-[0.2em] text-[rgba(239,230,210,0.32)]">
          redstring.lol — the board decides
        </p>
      </footer>
    </>
  );
}
