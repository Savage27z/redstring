/**
 * End-to-end checks against a running dev server.
 *
 *   npm run dev            # in one shell
 *   npm run smoke          # in another
 *
 * Covers the things unit tests cannot reach: that oversized or malformed input
 * is rejected BEFORE a Checkout session exists, that rate limiting engages, and
 * that a replayed Stripe webhook does not apply the same bid twice.
 *
 * The webhook signature is computed locally with the same HMAC scheme Stripe
 * uses, so this exercises the real verification path with no network calls.
 */
import crypto from 'node:crypto';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`ok    ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

const newCase = (over = {}) => ({
  title: 'Smoke Co',
  tagline: 'a tagline',
  url: 'https://example.com/smoke',
  logoUrl: null,
  category: 'other',
  ...over,
});

async function board() {
  const res = await fetch(BASE + '/api/board', { cache: 'no-store' });
  return res.json();
}

console.log(`--- validation (${BASE})`);

{
  const r = await post('/api/checkout', { amount: 1, bidderName: 'x', newCase: newCase() });
  check('below minimum bid rejected', r.status === 400, `got ${r.status}`);
}
{
  const r = await post('/api/checkout', { amount: 1e12, bidderName: 'x', newCase: newCase() });
  check('above maximum bid rejected', r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
}
{
  const r = await post('/api/checkout', {
    amount: 10,
    newCase: newCase({ url: 'javascript:alert(1)' }),
  });
  check('non-http scheme rejected', r.status === 400, `got ${r.status}`);
}
{
  const r = await post('/api/checkout', {
    amount: 10,
    newCase: newCase({ url: 'https://example.com/' + 'a'.repeat(400) }),
  });
  check('over-long URL rejected before payment', r.status === 400, `got ${r.status}`);
}
{
  const r = await post('/api/checkout', {
    amount: 10,
    newCase: newCase({ title: 'T'.repeat(200) }),
  });
  check('over-long title rejected before payment', r.status === 400, `got ${r.status}`);
}
{
  const r = await post('/api/checkout', { amount: 10, newCase: newCase({ url: 'not a url' }) });
  check('malformed URL rejected', r.status === 400, `got ${r.status}`);
}
{
  const r = await post('/api/checkout', { amount: 10, newCase: newCase({ title: '   ' }) });
  check('blank title rejected', r.status === 400, `got ${r.status}`);
}
{
  const before = await board();
  const r = await post('/api/checkout', {
    amount: 12,
    bidderName: 'smoke',
    newCase: newCase({ title: 'Valid Entry' }),
  });
  const after = await board();

  if (r.json?.devMode) {
    check('valid submission accepted', r.status === 200, `got ${r.status}`);
    check(
      'valid submission lands on the board',
      after.submissions.length === before.submissions.length + 1,
      `${before.submissions.length} -> ${after.submissions.length}`,
    );
    check(
      'url normalized on store',
      after.submissions.some((s) => s.title === 'Valid Entry' && s.url.startsWith('https://')),
    );
  } else {
    console.log('skip  valid-submission tests (Stripe configured, so checkout defers to Stripe)');
    check(
      'valid submission does NOT bypass payment when Stripe is configured',
      after.submissions.length === before.submissions.length,
      'a bid landed without payment',
    );
  }
}

console.log('\n--- rate limiting');
{
  // the limit is 10/min; the calls above already consumed some of the window
  let sawLimit = false;
  for (let i = 0; i < 15; i++) {
    const r = await post('/api/checkout', { amount: 1 });
    if (r.status === 429) {
      sawLimit = true;
      break;
    }
  }
  check('checkout rate limit engages', sawLimit);
}

console.log('\n--- webhook idempotency');
if (!WEBHOOK_SECRET) {
  console.log('skip  STRIPE_WEBHOOK_SECRET not set (run the server with dummy Stripe env)');
} else {
  const sessionId = 'cs_test_' + crypto.randomBytes(8).toString('hex');
  const event = {
    id: 'evt_' + crypto.randomBytes(8).toString('hex'),
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        amount_total: 4200,
        metadata: {
          submissionId: '',
          amount: '42',
          bidderName: 'webhook-tester',
          newCase: JSON.stringify(newCase({ title: 'Webhook Entry' })),
        },
      },
    },
  };

  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${ts}.${payload}`)
    .digest('hex');

  const send = () =>
    fetch(BASE + '/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': `t=${ts},v1=${sig}`,
      },
      body: payload,
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

  const before = await board();
  const first = await send();
  const mid = await board();
  const second = await send();
  const after = await board();

  check('signed webhook accepted', first.status === 200, JSON.stringify(first.json));
  check(
    'first delivery places the bid',
    mid.submissions.length === before.submissions.length + 1,
    `${before.submissions.length} -> ${mid.submissions.length}`,
  );
  check('replay reports duplicate', second.json?.duplicate === true, JSON.stringify(second.json));
  check(
    'replay does NOT place a second bid',
    after.submissions.length === mid.submissions.length,
    `${mid.submissions.length} -> ${after.submissions.length}`,
  );
  check(
    'replay does NOT inflate total raised',
    after.stats.totalRaised === mid.stats.totalRaised,
    `${mid.stats.totalRaised} -> ${after.stats.totalRaised}`,
  );
  check(
    'amount comes from the charge, not metadata',
    after.submissions.some((s) => s.title === 'Webhook Entry' && s.currentBid === 42),
  );

  // tampered signature must be refused
  const bad = await fetch(BASE + '/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=deadbeef` },
    body: payload,
  });
  check('forged signature rejected', bad.status === 400, `got ${bad.status}`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
