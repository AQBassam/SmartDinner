import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CATEGORY_ORDER, INGREDIENTS, ING, type Ingredient, type SoldT, type StoreId } from '../lib/data';
import { commonBasket, compareStores, needsBuying } from '../lib/engine';
import { arCount, num, omr, todayISO } from '../lib/format';
import { isExpired, isStale, resolvePrice, unitCost, type PriceRecord, type PriceSource, type StoreMode } from '../lib/prices';
import { members, newId, PriceRecordSchema, soldFits } from '../lib/state';
import type { Store } from '../store';
import { SOURCE_COLOR, SOURCE_LABEL, SOURCE_TONE, STORE_LABEL } from './shared';
import { Badge, Button, Card, Icon, IconButton, SectionTitle, Sheet, useToast } from './ui';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const SHORT = { produce: 'خضراوات وفواكه', protein: 'لحوم وبيض', dairy: 'ألبان وأجبان', bakery: 'خبز', pantry: 'معلبات وحبوب', staples: 'أساسيات' } as const;
const MODES: { id: StoreMode; label: string }[] = [
  { id: 'auto', label: 'أحدث سعر' }, { id: 'lulu', label: 'لولو' }, { id: 'nesto', label: 'نستو' }, { id: 'hypermax', label: 'هايبرماكس' }, { id: 'cheapest', label: 'الأرخص' },
];
const TYPE_LABEL: Record<PriceRecord['type'], string> = { verified: 'تحقق من صفحة المتجر', manual: 'سعر الرف', promo: 'عرض مؤقت', estimate: 'تقدير' };

export function BudgetTab({ store }: { store: Store }) {
  const { state, gen, input, set } = store;
  const b = gen.budget;
  const N = state.nights.length;
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);
  const cats = CATEGORY_ORDER.filter((c) => b.byCategory[c] > 0);
  const [editIng, setEditIng] = useState<string | null>(null);
  const [quickStore, setQuickStore] = useState<StoreId | null>(null);
  const cmp = useMemo(() => compareStores(input), [input]);
  const today = todayISO();

  useEffect(() => {
    if (!canvas.current) return;
    chart.current?.destroy();
    chart.current = new Chart(canvas.current, {
      type: 'bar',
      data: { labels: cats.map((c) => SHORT[c]), datasets: [{ data: cats.map((c) => +b.byCategory[c].toFixed(3)), backgroundColor: '#2e6a4a', borderRadius: 8, maxBarThickness: 26 }] },
      options: {
        locale: 'en-US', // Western digits on the axis (the page locale is ar-OM)
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { tooltip: { rtl: true, callbacks: { label: (ctx) => omr(Number(ctx.raw)) }, bodyFont: { family: 'Tajawal' }, titleFont: { family: 'Tajawal' } } },
        scales: {
          x: { position: 'top', reverse: true, grid: { color: '#e7eae0' }, ticks: { font: { family: 'Tajawal' }, color: '#6c6470' } },
          y: { position: 'right', grid: { display: false }, ticks: { font: { family: 'Tajawal', size: 13 }, color: '#2a1b2d' } },
        },
      },
    });
    return () => chart.current?.destroy();
  }, [cats.join(), b.byCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const srcTotal = Object.values(b.bySource).reduce((s, v) => s + v, 0) || 1;
  const usedIngs = useMemo(() => {
    const ids = new Set(gen.batches.flatMap((x) => x.lines.filter(needsBuying).map((l) => l.ing.id)));
    return INGREDIENTS.filter((i) => ids.has(i.id));
  }, [gen.batches]);
  const basket = useMemo(() => commonBasket(cmp), [cmp]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="مبلغ الشراء" value={omr(b.purchase)} hint="ما يُدفع عند الصندوق" tone="copper" />
        <Kpi label="تكلفة الاستهلاك" value={omr(b.consumption)} hint="ما تأكله الخطة فعلًا" tone="teal" />
        <Kpi label="لكل عشاء" value={omr(b.perDinner)} hint={`الاستهلاك ÷ ${N} ليلة`} />
        <Kpi label="لكل فرد في العشاء" value={omr(b.perPersonDinner)} hint={`÷ ${members(state)} أفراد`} />
      </div>

      <div>
        <SectionTitle title="أسعار أي متجر؟" hint="يغيّر الأسعار وأحجام العبوات المستخدمة في القائمة والميزانية." />
        <div className="scroll-x -mx-4 flex gap-2 px-4" role="radiogroup" aria-label="مصدر الأسعار">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={state.storeMode === m.id} onClick={() => set({ storeMode: m.id })}
              className={`min-h-10 shrink-0 rounded-full border px-4 text-[14px] font-bold ${state.storeMode === m.id ? 'border-teal bg-teal text-white' : 'border-line bg-paper'}`}>
              {m.label}
            </button>
          ))}
        </div>
        {(() => {
          const sel = cmp.find((c) => c.store === state.storeMode);
          return sel && sel.store !== 'cheapest' && sel.ownPriced === 0 && (
            <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[13px] leading-relaxed text-warn">
              لا توجد أسعار مسجلة من {STORE_LABEL[sel.store]}؛ القائمة والميزانية الآن بالأسعار الافتراضية، لا بأسعاره.
            </p>
          );
        })()}
        <Card className="mt-3 divide-y divide-line">
          {cmp.filter((c): c is typeof c & { store: StoreId } => c.store !== 'cheapest').map((c) => (
            <div key={c.store} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{STORE_LABEL[c.store]}</p>
                <p className="text-[12.5px] text-muted">
                  {c.ownPriced === 0
                    ? 'لا توجد أسعار مسجلة لهذا المتجر بعد'
                    : <>أسعار المتجر نفسه لـ<span className="num">{c.ownPriced}</span> من <span className="num">{c.lines}</span> بندًا في الخطة</>}
                </p>
              </div>
              {c.ownPriced === 0
                ? <Button variant="soft" icon="plus" onClick={() => setQuickStore(c.store)}>تسجيل أسعار</Button>
                : (
                  <div className="text-end">
                    <span className="num block text-[16px] font-extrabold">{omr(c.ownTotal)}</span>
                    <button className="text-[12px] font-bold text-teal underline" onClick={() => setQuickStore(c.store)}>إضافة أسعار</button>
                  </div>
                )}
            </div>
          ))}
        </Card>
        <div className="mt-3 rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed">
          {basket && basket.ings.length > 0 ? (
            <>
              <p className="font-extrabold">مقارنة عادلة على <span className="num">{basket.ings.length}</span> من الأصناف المسعّرة في {basket.stores.map((x) => STORE_LABEL[x]).join(' و')}</p>
              <ul className="mt-2 space-y-1">
                {[...basket.stores].sort((a, b2) => basket.totals[a]! - basket.totals[b2]!).map((x, k) => (
                  <li key={x} className="flex justify-between">
                    <span>{STORE_LABEL[x]}{k === 0 && <Badge tone="ok">الأوفر</Badge>}</span>
                    <span className="num font-bold">{omr(basket.totals[x]!)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12.5px] text-muted">الأصناف نفسها بالكميات نفسها؛ ما لم يُسعَّر في كل المتاجر لا يدخل المقارنة.</p>
            </>
          ) : (
            <p className="text-muted">
              المقارنة بين المتاجر تحتاج أسعارًا من متجرين على الأقل للأصناف نفسها. أسعار لولو الحالية من موقعه الرسمي؛ أسعار نستو وهايبرماكس تُنشر في نشرات عروض مصورة، فتُسجَّل من النشرة أو من الرف عبر «تسجيل أسعار». المجموع لا يُعرض لمتجر بلا أسعار حتى لا تظهر أرقام متطابقة غير حقيقية.
            </p>
          )}
        </div>
      </div>

      <Card className="p-4">
        <h3 className="text-[15px] font-extrabold">كيف تُحسب الأرقام</h3>
        <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-ink/85">
          <li><b>مبلغ الشراء</b> = Σ (عدد العبوات × سعر العبوة) + Σ (الوزن بالكغ × سعر الكغ)، بعد خصم ما في المنزل.</li>
          <li><b>تكلفة الاستهلاك</b> = Σ (الكمية التي تستهلكها الوصفات من المشتريات × سعر الوحدة)، دون تقريب العبوات.</li>
          <li>الفرق <b className="num">{omr(b.purchase - b.consumption)}</b> مخزون متبقٍّ يدخل الدورة التالية.</li>
        </ul>
        {b.stale.length > 0 && <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">أسعار أقدم من 30 يومًا ما تزال محتسبة وتحتاج مراجعة: {b.stale.join('، ')}.</p>}
      </Card>

      <div>
        <SectionTitle title="الشراء حسب الفئة" />
        <Card className="p-3"><div className="h-56"><canvas ref={canvas} role="img" aria-label="مبلغ الشراء حسب الفئة" /></div></Card>
      </div>

      <div>
        <SectionTitle title="موثوقية الأسعار" hint="نسبة مبلغ الشراء المبنية على كل نوع سعر." />
        <Card className="p-4">
          <div className="flex h-3 overflow-hidden rounded-full">
            {(Object.keys(SOURCE_COLOR) as PriceSource[]).filter((k) => b.bySource[k] > 0).map((k) => (
              <div key={k} style={{ width: `${(b.bySource[k] / srcTotal) * 100}%`, background: SOURCE_COLOR[k] }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            {(Object.keys(SOURCE_COLOR) as PriceSource[]).filter((k) => b.bySource[k] > 0).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: SOURCE_COLOR[k] }} />
                {SOURCE_LABEL[k]}: <span className="num font-bold">{Math.round((b.bySource[k] / srcTotal) * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            الأسعار الموثقة من متجر لولو عُمان الإلكتروني بتاريخ 18 أكتوبر 2026 (شاملة الضريبة؛ بعض الأصناف كانت غير متوفرة للتوصيل يومها). التقديرات للتخطيط فقط.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle title="الأسعار المستخدمة" hint="لكل صنف سجل أسعار حسب المتجر. السعر يُحفظ بتاريخه، والعرض المؤقت يتوقف عند انتهائه." />
        <Card className="divide-y divide-line">
          {usedIngs.map((ing) => {
            const p = resolvePrice(ing, state.priceBook, state.storeMode, today);
            const n = state.priceBook.filter((r) => r.ing === ing.id).length;
            return (
              <button key={ing.id} onClick={() => setEditIng(ing.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-sand/50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-bold">{ing.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                    <span>{soldText(p.sold)}{p.store ? ` · ${STORE_LABEL[p.store]}` : ''}</span>
                    <Badge tone={SOURCE_TONE[p.source]}>{SOURCE_LABEL[p.source]}</Badge>
                    {p.stale && <Badge tone="warn">قديم</Badge>}
                    {p.fallback && <Badge tone="muted">افتراضي</Badge>}
                    {n > 0 && <span><span className="num">{n}</span> سجل</span>}
                  </div>
                </div>
                <span className="num shrink-0 text-[15px] font-bold">{p.value?.toFixed(3) ?? '—'}</span>
                <Icon name="plus" className="size-4 shrink-0 text-teal" />
              </button>
            );
          })}
        </Card>
      </div>

      <div>
        <SectionTitle title="حسب الدفعة" />
        <Card className="divide-y divide-line">
          {gen.batches.map((x) => (
            <div key={x.index} className="flex items-center justify-between px-4 py-3">
              <span>الدفعة <span className="num">{x.index + 1}</span> · الليالي <span className="num">{x.firstNight}–{x.lastNight}</span></span>
              <span className="num font-bold">{omr(x.total)}</span>
            </div>
          ))}
        </Card>
      </div>

      <PriceSheet ing={editIng ? ING[editIng] : null} store={store} onClose={() => setEditIng(null)} />
      <QuickPrices storeId={quickStore} ings={usedIngs} plan={store} cost={cmp.find((c) => c.store === 'cheapest')?.ownCost ?? {}} onClose={() => setQuickStore(null)} />
    </div>
  );
}

function soldText(s: SoldT | undefined): string {
  if (!s) return '';
  if (s.type === 'pack') return s.label;
  if (s.type === 'perKg') return 'للكيلوغرام';
  return `لكل ${s.label}`;
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'copper' | 'teal' }) {
  const color = tone === 'copper' ? 'text-copper' : tone === 'teal' ? 'text-teal' : 'text-ink';
  return (
    <Card className="p-4">
      <p className="text-[12.5px] font-bold text-muted">{label}</p>
      <p className={`num mt-1 text-[21px] font-extrabold ${color}`}>{value}</p>
      <p className="mt-0.5 text-[12px] text-muted">{hint}</p>
    </Card>
  );
}

// ---------------------------------------------------------------- price records
type SoldKind = 'pack' | 'perKg' | 'perPiece';
const PACK_UNITS: Record<Ingredient['unit'], { id: string; label: string; factor: number }[]> = {
  g: [{ id: 'g', label: 'غ', factor: 1 }, { id: 'kg', label: 'كغ', factor: 1000 }],
  ml: [{ id: 'ml', label: 'مل', factor: 1 }, { id: 'l', label: 'لتر', factor: 1000 }],
  pcs: [{ id: 'pcs', label: 'حبة/علبة', factor: 1 }],
  none: [],
};

function PriceSheet({ ing, store, onClose }: { ing: Ingredient | null; store: Store; onClose: () => void }) {
  const toast = useToast();
  const { state, set } = store;
  const [kind, setKind] = useState<SoldKind>('pack');
  const [err, setErr] = useState('');
  useEffect(() => { setErr(''); setKind(ing?.sold?.type === 'perKg' ? 'perKg' : ing?.sold?.type === 'perPiece' ? 'perPiece' : 'pack'); }, [ing]);
  if (!ing) return null;
  const today = todayISO();
  const records = state.priceBook.filter((r) => r.ing === ing.id).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
  const kinds: { id: SoldKind; label: string }[] = [
    { id: 'pack', label: 'عبوة' },
    ...(soldFits(ing.id, { type: 'perKg' }) ? [{ id: 'perKg' as const, label: 'بالكيلو' }] : []),
    ...(soldFits(ing.id, { type: 'perPiece', label: '' }) ? [{ id: 'perPiece' as const, label: 'بالحبة' }] : []),
  ];
  const units = PACK_UNITS[ing.unit];
  const defaultSize = ing.sold?.type === 'pack' ? ing.sold.size : 1;
  const defaultUnit = ing.unit === 'g' && defaultSize >= 1000 ? 'kg' : ing.unit === 'ml' && defaultSize >= 1000 ? 'l' : units[0]?.id;
  const defaultUnitFactor = units.find((u) => u.id === defaultUnit)?.factor ?? 1;

  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = Number(String(f.get('value')).replace(',', '.'));
    const product = String(f.get('product') ?? '').trim();
    let sold: SoldT;
    if (kind === 'pack') {
      const size = Number(String(f.get('size')).replace(',', '.'));
      const factor = units.find((u) => u.id === f.get('unit'))?.factor ?? 1;
      if (!(size > 0)) { setErr('حجم العبوة يجب أن يكون أكبر من صفر.'); return; }
      sold = { type: 'pack', size: size * factor, label: `${product || 'عبوة'} ${num(size, 2)} ${units.find((u) => u.id === f.get('unit'))?.label ?? ''}`.trim() };
    } else if (kind === 'perKg') sold = { type: 'perKg' };
    else sold = { type: 'perPiece', label: ing.forms?.[0] ?? 'حبة' };
    const url = String(f.get('url') ?? '').trim();
    const candidate = {
      id: newId('p'), ing: ing.id, store: f.get('store') as StoreId, product: product || ing.name, sold, value,
      type: f.get('type') as PriceRecord['type'], checkedAt: String(f.get('checkedAt')),
      validTo: String(f.get('validTo') ?? '') || undefined, url: url || undefined, region: String(f.get('region') ?? '').trim() || undefined,
    };
    const r = PriceRecordSchema.safeParse(candidate);
    if (!r.success) {
      const path = r.error.issues[0]?.path[0];
      setErr(path === 'url' ? 'الرابط يجب أن يبدأ بـ https://' : path === 'value' ? 'أدخل سعرًا بين 0 و200 ر.ع.' : path === 'validTo' || path === 'checkedAt' ? 'تحقق من التاريخ.' : 'تحقق من الحقول.');
      return;
    }
    if (r.data.validTo && r.data.validTo < r.data.checkedAt) { setErr('تاريخ انتهاء العرض قبل تاريخ التحقق.'); return; }
    if (r.data.checkedAt > today) { setErr('تاريخ التحقق في المستقبل.'); return; }
    set((s) => ({ priceBook: [...s.priceBook, r.data] }));
    e.currentTarget.reset();
    setErr('');
    toast(`حُفظ سعر ${ing.name} (${STORE_LABEL[r.data.store]}).`);
  };

  const unitCostText = (r: PriceRecord) => {
    const c = unitCost(ing, r.sold, r.value);
    if (ing.unit === 'g') return `${(c * 1000).toFixed(3)} / كغ`;
    if (ing.unit === 'ml') return `${(c * 1000).toFixed(3)} / لتر`;
    return `${c.toFixed(3)} / ${ing.forms?.[0] ?? 'حبة'}`;
  };

  return (
    <Sheet open onClose={onClose} title={`سعر: ${ing.name}`}>
      {records.length > 0 && (
        <ul className="mb-4 divide-y divide-line rounded-2xl border border-line bg-paper">
          {records.map((r) => {
            const expired = isExpired(r, today);
            const stale = !expired && r.type !== 'promo' && isStale(r.checkedAt, today);
            return (
              <li key={r.id} className={`flex items-start gap-2 px-3 py-2.5 ${expired ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1 text-[13.5px]">
                  <p className="font-bold">{STORE_LABEL[r.store]} · <span className="num">{r.value.toFixed(3)}</span> ر.ع <span className="font-normal text-muted">({soldText(r.sold)})</span></p>
                  <p className="text-[12px] text-muted">
                    {TYPE_LABEL[r.type]} · <span className="num">{r.checkedAt}</span>{r.validTo && <> · حتى <span className="num">{r.validTo}</span></>}
                    {r.region && ` · ${r.region}`} · <span className="num">{unitCostText(r)}</span>
                  </p>
                  <div className="mt-1 flex gap-1.5">
                    {expired && <Badge tone="muted">عرض منتهٍ</Badge>}
                    {stale && <Badge tone="warn">أقدم من 30 يومًا</Badge>}
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-teal underline">المصدر</a>}
                  </div>
                </div>
                <IconButton icon="x" label="حذف السعر" onClick={() => set((s) => ({ priceBook: s.priceBook.filter((x) => x.id !== r.id) }))} />
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={save} className="space-y-3">
        <p className="text-[14px] font-extrabold">إضافة سعر</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المتجر">
            <select name="store" defaultValue={state.storeMode === 'nesto' || state.storeMode === 'hypermax' || state.storeMode === 'lulu' ? state.storeMode : 'lulu'} className="input">
              {(Object.keys(STORE_LABEL) as StoreId[]).map((s) => <option key={s} value={s}>{STORE_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="نوع السعر">
            <select name="type" defaultValue="manual" className="input">
              {(Object.keys(TYPE_LABEL) as PriceRecord['type'][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="المنتج أو العلامة (اختياري)"><input name="product" maxLength={60} className="input" placeholder={ing.name} /></Field>
        <div className="flex gap-1 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="طريقة البيع">
          {kinds.map((k) => (
            <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
              className={`min-h-9 flex-1 rounded-full text-[13.5px] font-bold ${kind === k.id ? 'bg-paper text-teal shadow-sm' : 'text-muted'}`}>{k.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {kind === 'pack' && (
            <Field label="حجم العبوة">
              <div className="flex gap-1">
                <input name="size" inputMode="decimal" required defaultValue={num(defaultSize / defaultUnitFactor, 3)} className="input num min-w-0" />
                {units.length > 1
                  ? <select name="unit" defaultValue={defaultUnit} className="input w-20 shrink-0">{units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
                  : <input type="hidden" name="unit" value={units[0]?.id} />}
              </div>
            </Field>
          )}
          <Field label={kind === 'pack' ? 'سعر العبوة (ر.ع)' : kind === 'perKg' ? 'سعر الكيلو (ر.ع)' : 'سعر الحبة (ر.ع)'}>
            <input name="value" inputMode="decimal" required className="input num" placeholder="0.000" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ التحقق"><input type="date" name="checkedAt" required defaultValue={today} max={today} className="input" /></Field>
          <Field label="ينتهي في (للعروض)"><input type="date" name="validTo" className="input" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الفرع أو المنطقة"><input name="region" maxLength={80} className="input" placeholder="صحار…" /></Field>
          <Field label="رابط المصدر (https)"><input name="url" type="url" maxLength={500} className="input num" placeholder="https://" /></Field>
        </div>
        {err && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</p>}
        <Button type="submit" variant="primary" className="w-full">حفظ السعر</Button>
      </form>
    </Sheet>
  );
}

/** Fast entry for one store: the plan's items, most expensive first, priced in the catalog's pack. */
function QuickPrices({ storeId, ings, plan, cost, onClose }: { storeId: StoreId | null; ings: Ingredient[]; plan: Store; cost: Record<string, number>; onClose: () => void }) {
  const toast = useToast();
  const [promo, setPromo] = useState(false);
  const [err, setErr] = useState('');
  if (!storeId) return null;
  const today = todayISO();
  const list = [...ings].filter((i) => i.sold).sort((a, b) => (cost[b.id] ?? 0) - (cost[a.id] ?? 0));
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const validTo = String(f.get('validTo') ?? '') || undefined;
    const region = String(f.get('region') ?? '').trim() || undefined;
    if (promo && !validTo) { setErr('أدخل تاريخ انتهاء العرض.'); return; }
    if (validTo && validTo < today) { setErr('تاريخ انتهاء العرض مضى.'); return; }
    const added: PriceRecord[] = [];
    for (const ing of list) {
      const raw = String(f.get(`v_${ing.id}`) ?? '').trim().replace(',', '.');
      if (!raw) continue;
      const r = PriceRecordSchema.safeParse({
        id: newId('p'), ing: ing.id, store: storeId, product: ing.name, sold: ing.sold, value: Number(raw),
        type: promo ? 'promo' : 'manual', checkedAt: today, validTo: promo ? validTo : undefined, region,
      });
      if (!r.success) { setErr(`سعر غير صحيح: ${ing.name}`); return; }
      added.push(r.data);
    }
    if (!added.length) { setErr('لم يُدخل أي سعر.'); return; }
    plan.set((s) => ({ priceBook: [...s.priceBook, ...added] }));
    toast(`حُفظ ${arCount(added.length, ['سعر', 'سعران', 'أسعار', 'سعرًا'])} من ${STORE_LABEL[storeId]}.`);
    setErr('');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`تسجيل أسعار ${STORE_LABEL[storeId]}`}>
      <p className="mb-3 text-[13.5px] leading-relaxed text-muted">الأصناف مرتبة من الأعلى كلفة في خطتك. السعر لحجم العبوة المكتوب؛ إن اختلفت عبوة المتجر فاستخدم «الأسعار المستخدمة» في الأسفل لتسجيل حجمها الصحيح. يكفي ملء ما تعرفه.</p>
      <form onSubmit={save} className="space-y-3">
        <div className="flex gap-1 rounded-full bg-sand-2 p-1" role="radiogroup" aria-label="نوع السعر">
          {[{ v: false, l: 'سعر الرف' }, { v: true, l: 'عرض من النشرة' }].map((o) => (
            <button type="button" key={o.l} role="radio" aria-checked={promo === o.v} onClick={() => setPromo(o.v)}
              className={`min-h-9 flex-1 rounded-full text-[13.5px] font-bold ${promo === o.v ? 'bg-paper text-teal shadow-sm' : 'text-muted'}`}>{o.l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {promo && <Field label="ينتهي العرض في"><input type="date" name="validTo" min={today} className="input" /></Field>}
          <Field label="الفرع أو المنطقة"><input name="region" maxLength={80} className="input" placeholder="صحار…" /></Field>
        </div>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-paper">
          {list.map((ing) => (
            <li key={ing.id} className="flex items-center gap-3 px-3 py-2">
              <label htmlFor={`q_${ing.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">{ing.name.replace(/\s*\(.*\)$/, '')}</span>
                <span className="block text-[12px] text-muted">{soldText(ing.sold)}</span>
              </label>
              <input id={`q_${ing.id}`} name={`v_${ing.id}`} inputMode="decimal" placeholder="0.000" className="input num w-24 shrink-0" />
            </li>
          ))}
        </ul>
        {err && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</p>}
        <Button type="submit" variant="primary" className="w-full">حفظ الأسعار</Button>
      </form>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[12.5px] font-bold text-muted">{label}<div className="mt-1 font-normal text-ink">{children}</div></label>;
}
