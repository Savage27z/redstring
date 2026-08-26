import { layoutScatter } from './src/lib/scatter.ts';

let fails = 0;
const check = (n, c, x = '') => { if (!c) { fails++; console.log('FAIL:', n, x); } else console.log('ok  :', n); };

function validate(label, cells, n, aspect) {
  check(`${label}: count`, cells.length === n, `${cells.length}`);

  // strictly ranked by size — this is the whole mechanic
  const byRank = [...cells].sort((a, b) => a.rank - b.rank);
  let mono = true, worst = '';
  for (let i = 1; i < byRank.length; i++) {
    const prev = byRank[i - 1].w * byRank[i - 1].h;
    const cur = byRank[i].w * byRank[i].h;
    if (cur > prev + 1e-9) { mono = false; worst = `rank${byRank[i].rank} (${cur.toFixed(5)}) > rank${byRank[i-1].rank} (${prev.toFixed(5)})`; }
  }
  check(`${label}: size strictly ranked by bid`, mono, worst);

  // inside the cork
  const oob = cells.filter(c => c.x < -1e-6 || c.y < -1e-6 || c.x + c.w > 1 + 1e-6 || c.y + c.h > 1 + 1e-6);
  check(`${label}: all on the board`, oob.length === 0, JSON.stringify(oob.slice(0,2)));

  // no overlap (convert x back to board units so padding is isotropic)
  let ov = 0, sample = '';
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      const ax = a.x * aspect, aw = a.w * aspect, bx = b.x * aspect, bw = b.w * aspect;
      const dx = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
      const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (dx > 1e-4 && dy > 1e-4) { ov++; if (!sample) sample = `${a.id}/${b.id} by ${Math.min(dx,dy).toFixed(4)}`; }
    }
  }
  check(`${label}: no overlapping cards`, ov === 0, `${ov} pairs, e.g. ${sample}`);

  check(`${label}: positive dims`, cells.every(c => c.w > 0 && c.h > 0));
}

const A = 1.5;

// realistic skewed board
{
  const bids = [2400,1310,880,605,420,275,190,120,75,48,31,22,14,9,5];
  const e = bids.map((b,i) => ({ id: 'sub_' + String(i+1).padStart(2,'0'), bidAmount: b }));
  const cells = layoutScatter(e, A);
  validate('skewed-15', cells, 15, A);
  const r1 = cells.find(c => c.rank === 1), r15 = cells.find(c => c.rank === 15);
  console.log(`      #1 area ${(r1.w*r1.h).toFixed(4)} vs #15 ${(r15.w*r15.h).toFixed(4)} — ratio ${((r1.w*r1.h)/(r15.w*r15.h)).toFixed(1)}x`);
  check('smallest card still visible (>0.2% of board)', r15.w*r15.h > 0.002, (r15.w*r15.h).toFixed(5));
}

// determinism
{
  const e = [{id:'a',bidAmount:100},{id:'b',bidAmount:60},{id:'c',bidAmount:30}];
  const s1 = JSON.stringify(layoutScatter(e, A));
  const s2 = JSON.stringify(layoutScatter([...e].reverse(), A));
  check('deterministic + order-independent', s1 === s2);
}

// not a grid: y-positions must not correlate with rank
{
  const bids = Array.from({length:18},(_,i)=>({id:'x'+i,bidAmount:Math.round(2000/(i+1))}));
  const cells = layoutScatter(bids, A).sort((a,b)=>a.rank-b.rank);
  const ys = cells.map(c=>c.y);
  let inversions = 0;
  for (let i=1;i<ys.length;i++) if (ys[i] < ys[i-1]) inversions++;
  check('placement is unordered (not reading-order)', inversions >= 4, `${inversions} inversions of 17`);
}

// edge cases
check('empty', layoutScatter([], A).length === 0);
check('single', layoutScatter([{id:'a',bidAmount:5}], A).length === 1);
{
  const many = Array.from({length:60},(_,i)=>({id:'m'+i,bidAmount:5+Math.round(Math.random()*900)}));
  validate('stress-60', layoutScatter(many, A), 60, A);
}
{
  const equal = Array.from({length:12},(_,i)=>({id:'q'+i,bidAmount:100}));
  validate('all-equal-12', layoutScatter(equal, A), 12, A);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
