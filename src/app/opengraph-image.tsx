import { ImageResponse } from 'next/og';
import { getBoardState } from '@/lib/store';

/**
 * The link preview.
 *
 * This site's growth is people posting the board, so a share has to carry the
 * board — the leader, the price to take them, and how much is on the wall.
 * A bare text card would waste the one thing that makes it worth sharing.
 *
 * Rendered from live board state rather than a static file, so a preview always
 * shows the real standings. Note that Twitter and Slack cache previews per URL,
 * so this is mostly the state at first share.
 */

export const runtime = 'nodejs';
export const alt = 'redstring.lol — the board decides';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Fresh enough to reflect a changing board, cheap enough not to redraw per hit.
export const revalidate = 60;

const CORK = '#c1874a';
const INK = '#241608';
const RED = '#b3121b';
const PAPER = '#f4f2ec';
const GREEN = '#2f7d6d';

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

export default async function Image() {
  let leader = null as null | { title: string; tagline: string; bid: number };
  let raised = 0;
  let cases = 0;
  let takeTop = 0;

  try {
    const board = await getBoardState();
    const top = board.submissions[0];
    if (top) leader = { title: top.title, tagline: top.tagline, bid: top.currentBid };
    raised = board.stats.totalRaised;
    cases = board.stats.totalCases;
    takeTop = board.stats.priceToTakeNumberOne;
  } catch {
    // A preview must never fail because the database is briefly unreachable.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: CORK,
          // Cork tooth, faked with layered gradients since Satori has no filters.
          backgroundImage:
            'radial-gradient(circle at 20% 25%, rgba(233,190,136,0.5) 0%, transparent 45%),' +
            'radial-gradient(circle at 78% 70%, rgba(126,78,34,0.45) 0%, transparent 50%),' +
            'radial-gradient(circle at 55% 15%, rgba(140,88,40,0.3) 0%, transparent 40%)',
          padding: 56,
          border: `18px solid #8a5a2c`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: RED,
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 40, color: INK, fontWeight: 700, letterSpacing: -1 }}>
            redstring.lol
          </div>
          <div style={{ fontSize: 26, color: 'rgba(36,22,8,0.6)', marginLeft: 8 }}>
            the board decides
          </div>
        </div>

        {leader ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, flex: 1 }}>
            <div style={{ fontSize: 22, color: 'rgba(36,22,8,0.65)', letterSpacing: 4 }}>
              CURRENTLY #1
            </div>
            {/* the leader, rendered as its case file */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginTop: 14,
                backgroundColor: PAPER,
                padding: 12,
                width: 760,
                boxShadow: '0 14px 30px rgba(24,14,4,0.45)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: GREEN,
                  padding: '26px 30px',
                }}
              >
                <div style={{ fontSize: 62, color: '#ffffff', fontWeight: 700 }}>
                  {leader.title.slice(0, 26)}
                </div>
                {leader.tagline ? (
                  <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.78)', marginTop: 8 }}>
                    {leader.tagline.slice(0, 64)}
                  </div>
                ) : null}
                <div style={{ fontSize: 54, color: '#ffffff', marginTop: 18 }}>
                  {money(leader.bid)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 40,
              flex: 1,
            }}
          >
            <div style={{ fontSize: 52, color: INK, fontWeight: 700 }}>The board is empty</div>
            <div style={{ fontSize: 28, color: 'rgba(36,22,8,0.65)', marginTop: 12 }}>
              The first bid takes the whole wall.
            </div>
          </div>
        )}

        {/* the numbers that make it a competition */}
        <div style={{ display: 'flex', gap: 54, alignItems: 'flex-end' }}>
          {[
            ['RAISED', money(raised)],
            ['CASES', String(cases)],
            ['TAKE #1', money(takeTop)],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 20, color: 'rgba(36,22,8,0.55)', letterSpacing: 3 }}>
                {label}
              </div>
              <div
                style={{
                  fontSize: 44,
                  color: label === 'TAKE #1' ? RED : INK,
                  fontWeight: 700,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
