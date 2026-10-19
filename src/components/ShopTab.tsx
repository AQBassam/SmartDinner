import { useMemo, useState, type FormEvent } from 'react';
import { CATEGORIES, CATEGORY_ORDER, RECIPE } from '../lib/data';
import { needsBuying, type PurchaseLine } from '../lib/engine';
import { fmtDate, fmtDateShort, omr, relDay } from '../lib/format';
import { batchText, buyLabel, costLine, needLabel, shoppingCsv } from '../lib/purchase';
import { newId } from '../lib/state';
import type { TabId } from '../App';
import { minutesOf } from '../lib/schedule';
import { togglePrep, type Store } from '../store';
import { Chip } from './PlanTab';
import { SOURCE_LABEL, SOURCE_TONE, STORE_LABEL } from './shared';
import { Badge, Button, Card, Checkbox, Glyph, Icon, IconButton, SectionTitle, Switch, download, useToast } from './ui';

const AISLE = {
  protein: { emoji: '🥩', bg: '#fbe3dc' }, dairy: { emoji: '🧀', bg: '#fdf0d3' }, bakery: { emoji: '🍞', bg: '#f6e7d2' },
  produce: { emoji: '🥬', bg: '#e2efe5' }, pantry: { emoji: '🥫', bg: '#f3e4e0' }, staples: { emoji: '🧂', bg: '#ebe8f1' },
} as const;


export function ShopTab({ store, today, go }: { store: Store; today: string; go: (t: TabId) => void }) {
  const { state, gen, set } = store;
  const toast = useToast();
  const defaultBatch = useMemo(() => {
    const idx = gen.batches.findIndex((_, i) => {
      const next = gen.batches[i + 1];
      return !next || next.date > today;
    });
    return Math.max(0, idx);
  }, [gen.batches, today]);
  const [bi, setBi] = useState(defaultBatch);
  const [onlyRemaining, setOnlyRemaining] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const batch = gen.batches[Math.min(bi, gen.batches.length - 1)];
  const custom = state.custom.filter((c) => c.batch === batch.index);
  const buyLines = batch.lines.filter(needsBuying);
  const doneCount = buyLines.filter((l) => state.checked[l.key]).length + custom.filter((c) => c.checked).length;
  const totalCount = buyLines.length + custom.length;
  const session = store.days.get(batch.date)?.shop ?? [];

  const toggle = (key: string, v: boolean) => set((s) => {
    const checked = { ...s.checked };
    if (v) checked[key] = true; else delete checked[key];
    return { checked };
  });
  const setHave = (ingId: string, v: boolean) => set((s) => ({ have: { ...s.have, [ingId]: v } }));

  const text = () => batchText(batch, state.custom, gen.staples, { onlyRemaining, checked: state.checked });
  const share = async () => {
    const t = text();
    if (navigator.share) {
      try { await navigator.share({ text: t }); return; } catch { /* cancelled */ return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); toast('نُسخت القائمة.'); } catch { toast('تعذر النسخ في هذا المتصفح.'); }
  };

  const addCustom = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') ?? '').trim().slice(0, 90);
    if (!name) return;
    const qty = String(f.get('qty') ?? '').trim().slice(0, 60);
    set((s) => ({ custom: [...s.custom, { id: newId(), name, qty, batch: batch.index, checked: false }] }));
    e.currentTarget.reset();
    toast('أُضيف الصنف إلى هذه الدفعة.');
  };

  return (
    <div className="space-y-5">
      {/* trip selector */}
      <div className="no-print scroll-x -mx-4 flex gap-2 px-4">
        {gen.batches.map((b) => (
          <button key={b.index} onClick={() => setBi(b.index)} aria-pressed={b.index === batch.index}
            className={`shrink-0 rounded-2xl border px-4 py-2 text-start transition ${b.index === batch.index ? 'border-teal bg-teal text-white' : 'border-line bg-paper'}`}>
            <span className="block text-[14px] font-extrabold">الدفعة <span className="num">{b.index + 1}</span></span>
            <span className={`block text-[12px] ${b.index === batch.index ? 'text-white/85' : 'text-muted'}`}>{relDay(b.date, today)} · {fmtDateShort(b.date)}</span>
          </button>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted">{fmtDate(batch.date)}</p>
            <h2 className="text-[19px] font-extrabold">تسوق الليالي <span className="num">{batch.firstNight}–{batch.lastNight}</span></h2>
          </div>
          <button className="text-end" onClick={() => go('budget')} aria-label="فتح الميزانية">
            <p className="text-[12px] text-muted">مبلغ الشراء</p>
            <p className="num text-[19px] font-extrabold text-copper">{omr(batch.total)}</p>
            <p className="text-[12px] font-bold text-teal underline">الميزانية والمتاجر</p>
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-2">
            <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%` }} />
          </div>
          <span className="num text-[13px] font-bold text-muted">{doneCount}/{totalCount}</span>
        </div>
        <div className="no-print mt-3 grid grid-cols-3 gap-2">
          <Button variant="primary" icon="share" onClick={share}>مشاركة</Button>
          <Button variant="soft" icon="copy" onClick={copy}>نسخ</Button>
          <Button variant="soft" icon="print" onClick={() => window.print()}>طباعة</Button>
        </div>
        <div className="no-print mt-2">
          <Button variant="ghost" icon="download" className="w-full" onClick={() => { download('قائمة-تسوق-العشاء.csv', shoppingCsv(gen, state.custom, state.checked), 'text/csv;charset=utf-8'); toast('جُهّز ملف CSV لكل الدفعات (يفتح في Excel).'); }}>تنزيل القائمة كاملة (CSV لـ Excel)</Button>
        </div>
        <div className="no-print mt-1 border-t border-line pt-1">
          <Switch checked={onlyRemaining} onChange={setOnlyRemaining} label="إخفاء ما تم شراؤه" />
        </div>
      </Card>

      {session.length > 0 && (
        <details className="card no-print group rounded-2xl border border-ice/20 bg-ice-soft p-4" open={batch.date === today}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-extrabold text-ice">
            <span className="emoji" aria-hidden="true">🛍️</span> بعد الشراء: <span className="num">{minutesOf(session)}</span> دقيقة تحضير
            <Icon name="down" className="ms-auto size-4 transition group-open:rotate-180" />
          </summary>
          <ul className="mt-3 space-y-2.5 text-[14px] leading-relaxed">
            {session.map((t) => (
              <li key={t.key} className="flex items-start gap-3">
                <Checkbox checked={!!state.prepDone[t.key]} onChange={() => set((s) => ({ prepDone: togglePrep(s.prepDone, t.key, today) }))} label={t.text} />
                <span className={state.prepDone[t.key] ? 'text-muted line-through' : ''}>
                  {t.text}
                  <span className="block text-[12.5px] text-ice/90"><span className="num">{t.min}</span> د{t.note ? ` · ${t.note}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-ice/90">مهام كل مساء (الإذابة والتقطيع لعشاء الغد) تظهر في تبويب «اليوم» وفي تذكير التقويم.</p>
        </details>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const rows = batch.lines.filter((l) => l.cat === cat && !(onlyRemaining && (state.checked[l.key] || !needsBuying(l))));
        if (!rows.length) return null;
        return (
          <div key={cat}>
            <div className="mb-2 flex items-center gap-2.5 px-1">
              <Glyph emoji={AISLE[cat].emoji} bg={AISLE[cat].bg} size={34} />
              <h2 className="text-[17px] font-extrabold">{CATEGORIES[cat]}</h2>
            </div>
            <Card className="divide-y divide-line">
              {rows.map((l) => (
                <ShopRow key={l.key} l={l} checked={!!state.checked[l.key]} expanded={open === l.key}
                  onToggle={(v) => toggle(l.key, v)} onExpand={() => setOpen(open === l.key ? null : l.key)}
                  onHave={(v) => setHave(l.ing.id, v)} stock={state.stock[l.ing.id] ?? 0}
                  onStock={(v) => set((s) => { const stock = { ...s.stock }; if (v > 0) stock[l.ing.id] = v; else delete stock[l.ing.id]; return { stock }; })}
                  recipeTitle={(n) => RECIPE[state.nights[n - 1]]?.title ?? ''} nightDate={(n) => gen.nightDates[n - 1]} today={today} />
              ))}
            </Card>
          </div>
        );
      })}

      {/* custom items */}
      <div>
        <SectionTitle title="أصناف إضافية لهذه الدفعة" hint="مناديل، فاكهة، حليب… أي شيء خارج الوصفات." />
        <Card className="divide-y divide-line">
          {custom.filter((c) => !(onlyRemaining && c.checked)).map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Checkbox checked={c.checked} label={c.name} onChange={(v) => set((s) => ({ custom: s.custom.map((x) => (x.id === c.id ? { ...x, checked: v } : x)) }))} />
              <div className={`min-w-0 flex-1 ${c.checked ? 'text-muted line-through' : ''}`}>
                <div className="truncate font-bold">{c.name}</div>
                {c.qty && <div className="truncate text-[13px] text-muted">{c.qty}</div>}
              </div>
              <IconButton icon="x" label={`حذف ${c.name}`} className="no-print"
                onClick={() => { if (confirm(`حذف «${c.name}»؟`)) set((s) => ({ custom: s.custom.filter((x) => x.id !== c.id) })); }} />
            </div>
          ))}
          <form onSubmit={addCustom} className="no-print flex flex-wrap gap-2 p-3">
            <input name="name" required maxLength={90} placeholder="اسم الصنف" aria-label="اسم الصنف"
              className="min-h-11 min-w-0 flex-[2] rounded-xl border border-line bg-paper px-3" />
            <input name="qty" maxLength={60} placeholder="الكمية" aria-label="الكمية"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3" />
            <Button type="submit" variant="soft" icon="plus">إضافة</Button>
          </form>
        </Card>
      </div>

      {batch.index === 0 && gen.staples.length > 0 && (
        <div className="no-print">
          <SectionTitle title="أساسيات المخزن" hint="مفترض توفرها. اضغط على أي صنف ناقص ليُضاف إلى الشراء." />
          <div className="flex flex-wrap gap-2">
            {gen.staples.map((s) => (
              <Chip key={s.ing.id} active={!s.have} onClick={() => setHave(s.ing.id, !s.have)}>
                {s.have ? '' : '＋ '}{s.ing.name}{s.qty ? ` · ${needLabel(s.ing, s.qty)}` : ''}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShopRow({ l, checked, expanded, stock, onToggle, onExpand, onHave, onStock, recipeTitle, nightDate, today }: {
  l: PurchaseLine; checked: boolean; expanded: boolean; stock: number; onToggle: (v: boolean) => void; onExpand: () => void;
  onHave: (v: boolean) => void; onStock: (v: number) => void; recipeTitle: (night: number) => string; nightDate: (night: number) => string; today: string;
}) {
  const math = costLine(l);
  const covered = !l.have && !needsBuying(l);
  const unit = l.ing.unit === 'g' ? 'غ' : l.ing.unit === 'ml' ? 'مل' : l.ing.forms?.[2] ?? '';
  const [draft, setDraft] = useState(stock ? String(+stock.toFixed(2)) : '');
  return (
    <div className={l.have || covered ? 'bg-sand/60' : ''}>
      <div className="flex items-center gap-3 px-4 py-3">
        {l.have || covered ? <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok"><Icon name="home" className="size-4" /></span>
          : <Checkbox checked={checked} label={l.ing.name} onChange={onToggle} />}
        <button onClick={onExpand} aria-expanded={expanded} className="min-w-0 flex-1 text-start">
          <div className={`text-[15.5px] font-bold ${checked || l.have || covered ? 'text-muted line-through decoration-1' : ''}`}>{l.ing.name}</div>
          <div className="text-[13.5px] text-ink/80">{buyLabel(l)}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {l.fromStock > 0 && !l.have && !covered && <Badge tone="ok" icon="home">من المنزل {needLabel(l.ing, l.fromStock)}</Badge>}
            {l.frozenProduct && <Badge tone="ice" icon="snow">يُحفظ مجمدًا</Badge>}
            {l.freezeNights.length > 0 && <Badge tone="ice" icon="snow">جمّد حصة الليالي {l.freezeNights.map((n, i) => <span key={n}>{i ? '، ' : ''}<span className="num">{n}</span></span>)}</Badge>}
            {l.tightNights.length > 0 && <Badge tone="warn" icon="alert">قد يذبل قبل الليلة {l.tightNights.map((n, i) => <span key={n}>{i ? '، ' : ''}<span className="num">{n}</span></span>)}</Badge>}
            {l.price.stale && needsBuying(l) && <Badge tone="warn">السعر يحتاج مراجعة</Badge>}
          </div>
        </button>
        <div className="shrink-0 text-end">
          {needsBuying(l) && l.unitPrice !== null && <div className="num text-[14px] font-bold">{l.cost.toFixed(3)}</div>}
          <Icon name="down" className={`ms-auto mt-0.5 size-4 text-muted transition ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {expanded && (
        <div className="space-y-2.5 px-4 pb-4 ps-14 text-[13.5px]">
          <div>
            <p className="font-bold text-muted">تحتاجه الوصفات: {needLabel(l.ing, l.need)}</p>
            <ul className="mt-1 space-y-0.5">
              {l.portions.map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span><b className="font-bold">{relDay(nightDate(p.night), today)}</b>: {recipeTitle(p.night)}</span>
                  <span className="num shrink-0">{needLabel(l.ing, p.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
          {l.leftover > 0.01 && <p className="text-muted">يتبقى بعد الخطة: {needLabel(l.ing, l.leftover)}</p>}
          {math && <p className="num text-start text-muted">{math} ر.ع</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SOURCE_TONE[l.priceSource]}>{SOURCE_LABEL[l.priceSource]}</Badge>
            {l.price.store && <span className="text-[12px] text-muted">{STORE_LABEL[l.price.store]}{l.price.date ? <> · <span className="num">{l.price.date}</span></> : null}</span>}
            {l.price.fallback && <span className="text-[12px] text-warn">لا يوجد سعر لهذا المتجر؛ استُخدم السعر الافتراضي</span>}
          </div>
          {l.ing.unit !== 'none' && (
            <form className="no-print flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); (e.currentTarget.elements.namedItem('stock') as HTMLInputElement).blur(); }}>
              <label htmlFor={`stock-${l.key}`} className="text-[13px] font-bold text-muted">عندي منه الآن</label>
              <input id={`stock-${l.key}`} name="stock" inputMode="decimal" value={draft} placeholder="0"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { const n = Number(draft.replace(',', '.')); onStock(Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0); }}
                className="num min-h-10 w-24 rounded-xl border border-line bg-paper px-2 text-center" />
              <span className="text-[13px] text-muted">{unit}</span>
            </form>
          )}
          <div className="no-print">
            <Switch checked={l.have} onChange={onHave} label="عندي كل الكمية (لا يُحتسب في الشراء)" />
          </div>
        </div>
      )}
    </div>
  );
}
