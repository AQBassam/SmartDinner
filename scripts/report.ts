// Prints the generated 15-night plan for human audit: npx tsx scripts/report.ts [people]
import { DEFAULT_ORDER, RECIPE } from '../src/lib/data';
import { generate } from '../src/lib/engine';
import { defaultState } from '../src/lib/state';
import { planInput } from '../src/store';
import { buyLabel, needLabel, costLine } from '../src/lib/purchase';
const people = Number(process.argv[2] ?? 5);
const st = { ...defaultState(new Date('2026-10-18T06:00:00Z')), household: { adults: people, teens: 0, kids: 0 }, startDate: '2026-10-20' };
const g = generate(planInput(st, '2026-10-18'));
DEFAULT_ORDER.forEach((id, i) => console.log(`N${i + 1} ${g.nightDates[i]} ${RECIPE[id].title}`));
for (const b of g.batches) {
  console.log(`\n=== Trip ${b.index + 1} ${b.date} nights ${b.firstNight}-${b.lastNight} total ${b.total.toFixed(3)}`);
  for (const l of b.lines) {
    const flags = [l.frozenProduct && 'FROZEN', l.freezeNights.length && `freeze:${l.freezeNights}`, l.tightNights.length && `TIGHT:${l.tightNights}`, l.leftover > 0.01 && `left:${needLabel(l.ing, l.leftover)}`].filter(Boolean).join(' ');
    console.log(`${l.ing.name} | need ${needLabel(l.ing, l.need)} | buy ${buyLabel(l)} | ${costLine(l) ?? '-'} [${l.priceSource}] ${flags}`);
  }
}
console.log('\nstaples:', g.staples.map((s) => s.ing.name + (s.qty ? ` ${needLabel(s.ing, s.qty)}` : '')).join(' | '));
const B = g.budget;
console.log(`\npurchase ${B.purchase.toFixed(3)} consumption ${B.consumption.toFixed(3)} perDinner ${B.perDinner.toFixed(3)} perPerson ${B.perPersonDinner.toFixed(3)}`);
console.log('bySource', Object.fromEntries(Object.entries(B.bySource).map(([k, v]) => [k, v.toFixed(3)])));
console.log('reminders'); g.reminders.forEach((r) => console.log(r.date, r.title, '—', r.body));
