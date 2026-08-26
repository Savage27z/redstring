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
