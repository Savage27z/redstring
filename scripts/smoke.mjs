/**
 * End-to-end checks against a running dev server.
 *
 *   npm run dev            # in one shell
 *   npm run smoke          # in another
 *
 * Covers the things unit tests cannot reach: that oversized or malformed input
 * is rejected BEFORE any payment is opened, that rate limiting engages, and
 * that the crypto settlement endpoints refuse anything they cannot verify
 * on chain.
 */

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';

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
    console.log('skip  valid-submission tests (a chain is configured, so checkout opens a payment)');
    check(
      'valid submission does NOT bypass payment when a chain is configured',
      after.submissions.length === before.submissions.length,
      'a bid landed without payment',
    );
  }
}

console.log('\n--- crypto payment rails');
{
  const res = await fetch(BASE + '/api/chains', { cache: 'no-store' });
  const data = await res.json();
  check('chains endpoint responds', res.status === 200, `got ${res.status}`);
  check('testnet flag present', typeof data.testnet === 'boolean');

  if (!data.chains?.length) {
    console.log('skip  no chain configured (set SOLANA_RECIPIENT / BASE_RECIPIENT)');
  } else {
    console.log(`      configured: ${data.chains.map((c) => c.id).join(', ')} (testnet=${data.testnet})`);

    for (const c of data.chains) {
      const before = await board();
      const r = await post('/api/checkout', {
        amount: 9,
        bidderName: 'crypto-tester',
        chain: c.id,
        newCase: newCase({ title: `Pay ${c.id}` }),
      });
      const after = await board();

      check(`${c.id}: checkout opens a payment intent`, !!r.json?.intent, JSON.stringify(r.json));
      check(
        `${c.id}: nothing reaches the board before payment`,
        after.submissions.length === before.submissions.length,
        'an unpaid bid landed',
      );

      if (c.id === 'solana') {
        const url = r.json?.solana?.url ?? '';
        check('solana: returns a solana: URL', url.startsWith('solana:'));
        check('solana: returns a QR image', !!r.json?.solana?.qr?.startsWith('data:image/'));
        // A transfer request carries the amount and mint itself. A transaction
        // request (solana:https://...) would make the wallet ask to connect.
        check('solana: is a transfer request, not a connect-style link', !url.includes('http'));
        check('solana: pins the amount', url.includes('amount='));
        check('solana: pins the USDC mint', url.includes('spl-token='));
        check('solana: carries a reference for matching', url.includes('reference='));
      } else {
        const uri = r.json?.base?.uri ?? '';
        check('base: returns an EIP-681 payment URI', uri.startsWith('ethereum:'));
        check('base: returns a QR image', !!r.json?.base?.qr?.startsWith('data:image/'));
        check('base: pins the chain id', typeof r.json?.base?.chainId === 'number');
        check('base: sends no signable calldata', r.json?.base?.data === undefined);
      }

      const id = r.json?.intent?.id;
      if (id) {
        const poll = await fetch(`${BASE}/api/payments/${id}`, { cache: 'no-store' }).then((x) =>
          x.json(),
        );
        check(`${c.id}: unpaid intent still pending`, poll.intent?.status === 'pending',
          JSON.stringify(poll.intent));

        const bogus = await post(`/api/payments/${id}`, { txHash: '0x' + 'de'.repeat(32) });
        const afterBogus = await board();
        check(
          `${c.id}: bogus tx hash does not settle`,
          bogus.json?.intent?.status !== 'confirmed',
          JSON.stringify(bogus.json?.intent),
        );
        check(
          `${c.id}: bogus tx hash places no bid`,
          afterBogus.submissions.length === before.submissions.length,
        );
      }
    }
  }

  const unknown = await fetch(`${BASE}/api/payments/pay_doesnotexist`, { cache: 'no-store' }).then(
    (x) => x.json(),
  );
  check('unknown payment id is rejected', !!unknown.error, JSON.stringify(unknown));
}


console.log('\n--- rate limiting');
{
  // anything after it would 429 and look like a real failure.
  // Runs last on purpose: it deliberately exhausts the checkout budget, so
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


console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
