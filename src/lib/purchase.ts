import { CATEGORIES, CATEGORY_ORDER, STORES, type Ingredient } from './data';
import { needsBuying, type Batch, type Generated, type PurchaseLine, type StapleUse } from './engine';
import { arCount, fmtDate, fmtGrams, fmtMl, fmtQty, num } from './format';
import type { CustomItem } from './state';

/** What to pick up at the shop. */
export function buyLabel(l: PurchaseLine): string {
  const ing = l.ing;
  const s = l.price.sold;
  if (l.have) return 'متوفر في المنزل';
  if (l.buy <= 1e-9) return 'مغطّى مما في المنزل أو من دفعة سابقة';
  if (!s || ing.unit === 'none') return 'حسب الحاجة';
  if (s.type === 'pack') return l.packs && l.packs > 1 ? `${l.packs} × ${s.label}` : s.label;
  if (s.type === 'perPiece') return arCount(Math.max(1, Math.round(l.buy)), ing.forms!);
  if (ing.unit === 'pcs') {
    const kg = (l.buy * (ing.pieceG ?? 0)) / 1000;
    return `${arCount(Math.round(l.buy), ing.forms!)} (نحو ${num(kg, 2)} كغ)`;
  }
  return fmtGrams(Math.ceil(l.buy / 50) * 50);
}

/** What the recipes actually consume from this purchase. */
export function needLabel(ing: Ingredient, q: number): string {
  if (ing.unit === 'g') return fmtGrams(Math.round(q / 10) * 10);
  if (ing.unit === 'ml') return q <= 90 ? fmtMl(q) : `${num(Math.round(q / 10) * 10, 0)} مل`;
  return fmtQty(ing, q);
}

export function costLine(l: PurchaseLine): string | null {
  if (l.have || l.unitPrice === null || l.buy <= 1e-9) return null;
  const s = l.price.sold;
  if (s?.type === 'pack' && l.packs) return `${l.packs} × ${l.unitPrice.toFixed(3)} = ${l.cost.toFixed(3)}`;
  if (s?.type === 'perKg') {
    const kg = l.ing.unit === 'pcs' ? (l.buy * (l.ing.pieceG ?? 0)) / 1000 : l.buy / 1000;
    return `${num(kg, 2)} كغ × ${l.unitPrice.toFixed(3)} = ${l.cost.toFixed(3)}`;
  }
  if (s?.type === 'perPiece') return `${Math.round(l.buy)} × ${l.unitPrice.toFixed(3)} = ${l.cost.toFixed(3)}`;
  return null;
}

export function batchText(b: Batch, custom: CustomItem[], staples: StapleUse[], opts: { onlyRemaining: boolean; checked: Record<string, boolean> }): string {
  const out: string[] = [`🛒 قائمة التسوق — الدفعة ${b.index + 1}`, `${fmtDate(b.date)} · لليالي ${b.firstNight}–${b.lastNight}`, ''];
  for (const cat of CATEGORY_ORDER) {
    const rows = b.lines.filter((l) => l.cat === cat && needsBuying(l) && !(opts.onlyRemaining && opts.checked[l.key]));
    if (!rows.length) continue;
    out.push(`*${CATEGORIES[cat]}*`);
    for (const l of rows) out.push(`• ${l.ing.name}: ${buyLabel(l)}`);
    out.push('');
  }
  const extra = custom.filter((c) => c.batch === b.index && !(opts.onlyRemaining && c.checked));
  if (extra.length) {
    out.push('*أصناف إضافية*');
    for (const c of extra) out.push(`• ${c.name}${c.qty ? `: ${c.qty}` : ''}`);
    out.push('');
  }
  if (b.index === 0) {
    const check = staples.filter((s) => s.have).map((s) => s.ing.name);
    if (check.length) out.push(`تحقق من توفرها في المنزل: ${check.join('، ')}`);
  }
  return out.join('\n').trim();
}

const SOURCE_AR: Record<string, string> = { verified: 'موثّق', recorded: 'مسجّل سابقًا', estimate: 'تقدير', user: 'سعر الأسرة', promo: 'عرض', none: 'دون سعر' };

function csvCell(v: string | number): string {
  const s = String(v);
  // neutralise spreadsheet formula injection and quote everything
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Excel-friendly CSV (UTF-8 BOM) of every purchase line and custom item. */
export function shoppingCsv(g: Generated, custom: CustomItem[], checked: Record<string, boolean>): string {
  const head = ['الدفعة', 'تاريخ الشراء', 'الفئة', 'الصنف', 'تحتاجه الوصفات', 'من المنزل', 'المطلوب شراؤه', 'عدد العبوات', 'التكلفة (ر.ع)', 'مصدر السعر', 'المتجر', 'تم الشراء'];
  const rows: (string | number)[][] = [];
  for (const b of g.batches) {
    for (const l of b.lines) {
      rows.push([
        b.index + 1, b.date, CATEGORIES[l.cat], l.ing.name, needLabel(l.ing, l.need), l.fromStock > 0 ? needLabel(l.ing, l.fromStock) : '',
        buyLabel(l), l.packs ?? '', l.cost.toFixed(3), SOURCE_AR[l.priceSource], l.price.store ? STORES[l.price.store] : '', checked[l.key] ? 'نعم' : '',
      ]);
    }
    for (const c of custom.filter((x) => x.batch === b.index)) {
      rows.push([b.index + 1, b.date, 'أصناف إضافية', c.name, '', '', c.qty, '', '', '', '', c.checked ? 'نعم' : '']);
    }
  }
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
