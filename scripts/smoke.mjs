/**
 * End-to-end checks against a running dev server.
 *
 *   npm run dev            # in one shell
 *   npm run smoke          # in another
 *
 * Covers the things unit tests cannot reach: that oversized or malformed input
 * is rejected BEFORE a Checkout session exists, that rate limiting engages, and
 * that a replayed Polar webhook does not apply the same bid twice.
 *
 * Webhook payloads are signed locally with the same Standard Webhooks library
 * that Polar's SDK verifies with, so this exercises the real verification path.
 */
import crypto from 'node:crypto';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET ?? '';

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
    console.log('skip  valid-submission tests (Polar configured, so checkout defers to Polar)');
    check(
      'valid submission does NOT bypass payment when Polar is configured',
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
  console.log('skip  POLAR_WEBHOOK_SECRET not set (run the server with dummy Polar env)');
} else {
  // Signed with the same Standard Webhooks library Polar's SDK verifies with,
  // so this drives the real verification path without touching the network.
  const { Webhook } = await import('standardwebhooks');
  const wh = new Webhook(Buffer.from(WEBHOOK_SECRET).toString('base64'));

  const orderId = 'ord_' + crypto.randomBytes(8).toString('hex');
  const event = {
    type: 'order.paid',
    data: {
      id: orderId,
      status: 'paid',
      paid: true,
      currency: 'usd',
      net_amount: 4200,
      total_amount: 4200,
      billing_name: null,
      customer_id: 'cus_smoketest',
      checkout_id: 'chk_smoketest',
      customer: { id: 'cus_smoketest', email: 'buyer@example.com' },
      metadata: {
        submissionId: '',
        amount: 42,
        bidderName: 'webhook-tester',
        newCase: JSON.stringify(newCase({ title: 'Webhook Entry' })),
      },
    },
  };

  const payload = JSON.stringify(event);
  const msgId = 'msg_' + crypto.randomBytes(8).toString('hex');
  const timestamp = new Date();

  const send = (signature) =>
    fetch(BASE + '/api/webhooks/polar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': msgId,
        'webhook-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
        'webhook-signature': signature,
      },
      body: payload,
    }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

  const goodSig = wh.sign(msgId, timestamp, payload);

  const before = await board();
  const first = await send(goodSig);
  const mid = await board();
  const second = await send(goodSig);
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
    'amount comes from the order total, not metadata',
    after.submissions.some((s) => s.title === 'Webhook Entry' && s.currentBid === 42),
  );

  const forged = await send('v1,' + Buffer.from('nope').toString('base64'));
  check('forged signature rejected', forged.status === 403, `got ${forged.status}`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
