import { useRef, type ReactNode } from 'react';
import { ALLERGEN_ORDER, ALLERGENS, INGREDIENTS, RECIPE, RECIPES } from '../lib/data';
import { defaultState, exportBackup, importBackup } from '../lib/state';
import type { TabId } from '../App';
import { addDays, fmtTime } from '../lib/format';
import { minutesOf } from '../lib/schedule';
import type { Store } from '../store';
import { Chip } from './PlanTab';
import { hasConflict, recipeConflicts } from './shared';
import { Button, Icon, download, useToast } from './ui';

function Section({ icon, title, children, open = false }: { icon: string; title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="card group rounded-2xl border border-line bg-paper shadow-[var(--shadow-card)]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-[16px] font-extrabold">
        <span className="grid size-9 place-items-center rounded-xl bg-teal-soft text-teal-deep"><Icon name={icon} /></span>
        {title}
        <Icon name="down" className="ms-auto size-4 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 text-[14.5px] leading-relaxed">{children}</div>
    </details>
  );
}

const List = ({ items }: { items: string[] }) => (
  <ul className="space-y-2">
    {items.map((t, i) => (
      <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal" /><span>{t}</span></li>
    ))}
  </ul>
);

export function MoreTab({ store, go }: { store: Store; go: (t: TabId) => void }) {
  const { state, set, replace, persisted, gen, days } = store;
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);

  const doExport = () => {
    download(`دليل-العشاء-نسخة-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(state), 'application/json;charset=utf-8');
    toast('جُهّزت النسخة الاحتياطية.');
  };
  const doImport = async (f: File) => {
    try {
      const { state: s, from, notes } = importBackup(await f.text());
      if (!confirm('ستحل النسخة المستوردة محل الخطة والقائمة الحاليتين. متابعة؟')) return;
      replace(s);
      const label = { v1: 'الإصدار الأول', 'html-v2': 'النسخة الثانية (HTML)', 'react-v2': 'نسخة المعاينة السابقة', v3: 'نسخة احتياطية' }[from];
      toast(`استُعيدت ${label}.${notes.length ? ' ' + notes.join(' ') : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'تعذر الاستيراد.');
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={() => go('budget')} className="card flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-paper px-4 text-start text-[16px] font-extrabold shadow-[var(--shadow-card)]">
        <span className="grid size-9 place-items-center rounded-xl bg-copper-soft text-copper"><Icon name="wallet" /></span>
        الميزانية وأسعار المتاجر
        <Icon name="down" className="ms-auto size-4 rotate-90 text-muted" />
      </button>

      <Section icon="snow" title="خطة التجهيز المسبق" open>
        {(() => {
          const eves = state.nights.map((_, i) => {
            const date = gen.nightDates[i];
            return minutesOf(days.get(addDays(date, -1))?.evening.filter((x) => x.night === i + 1) ?? []);
          });
          const avg = Math.round(eves.reduce((a, b) => a + b, 0) / Math.max(1, eves.length));
          const shops = gen.batches.map((b) => minutesOf(days.get(b.date)?.shop ?? []));
          const noAfternoon = state.nights.filter((_, i) => (days.get(gen.nightDates[i])?.afternoon.length ?? 0) === 0).length;
          const prepped = RECIPES.filter((r) => r.prep.length > 0).length;
          const aft = state.nights.map((_, i) => minutesOf(days.get(gen.nightDates[i])?.afternoon ?? [])).filter((m) => m > 0);
          return (
            <>
              <p className="text-muted">العشاء لا يحتاج وقتًا جديدًا؛ يحتاج أن يتوزع على ثلاث لحظات موجودة أصلًا في يوم الأسرة. <span className="num">{prepped}</span> من <span className="num">{RECIPES.length}</span> وصفة لها مهام مسبقة محددة بالدقائق، تظهر يومًا بيوم في تبويب «اليوم» وفي تذكيرات التقويم.</p>
              <p className="mb-2 mt-4 font-bold text-teal-deep">يوم التسوق · {shops.map((m, i) => <span key={i} className="num">{i ? ' / ' : ''}{m}</span>)} دقيقة للدفعات</p>
              <List items={[
                'تقسيم الدجاج واللحم والسمك إلى أكياس مسطحة، على كل كيس اسم الوجبة ورقم الليلة؛ الحصص القريبة في الثلاجة والبقية في الفريزر.',
                'ما يُشكَّل مرة واحدة يُشكَّل يوم الشراء ويُجمَّد جاهزًا (الكفتة).',
                'غسل الخس والبقدونس وتجفيفهما وحفظهما في علبة مبطنة بمنديل ورقي.',
              ]} />
              <p className="mb-2 mt-4 font-bold text-teal-deep">كل ليلة {fmtTime(state.times.prep)} · متوسط <span className="num">{avg}</span> دقيقة مع تجهيز غداء الغد</p>
              <List items={[
                'نقل حصة الغد من الفريزر إلى رف الثلاجة السفلي داخل وعاء.',
                'التقطيع والتتبيل والصلصات لعشاء الغد، في علب مغلقة مبردة. الأرز لا يُطهى مسبقًا، والسمك لا يُتبَّل بالليمون إلا قبل طهيه بربع ساعة.',
              ]} />
              <p className="mb-2 mt-4 font-bold text-teal-deep">بعد الغداء {fmtTime(state.times.ask)} · سؤال العشاء محسوم</p>
              <List items={[
                `الوجبة معروفة، وموعد بدء طهيها محسوب من موعد العشاء ${fmtTime(state.times.dinner)}.`,
                `${noAfternoon} من ${state.nights.length} ليلة في الخطة لا تحتاج أي عمل بعد الغداء${aft.length ? `؛ البقية بين ${Math.min(...aft)} و${Math.max(...aft)} دقائق (غسل خضار أو نقع أرز أو صلصة)` : ''}.`,
                'إن لم تكن هناك طاقة: زر «ما عندي طاقة الليلة» يقدّم وجبة طوارئ ويؤجل وجبة الليلة إلى الغد دون هدر.',
              ]} />
              <Button variant="soft" icon="home" className="mt-4 w-full" onClick={() => go('today')}>مهام اليوم</Button>
            </>
          );
        })()}
      </Section>

      <Section icon="alert" title="سلامة الغذاء والتخزين">
        <List items={[
          'إذابة اللحوم والدجاج والسمك داخل الثلاجة، لا على سطح المطبخ.',
          'الطعام المطهو يدخل الثلاجة خلال ساعتين، وأسرع في الأيام الحارة؛ العلب الضحلة تسرّع التبريد.',
          'الأرز المطهو يُبرَّد ويدخل الثلاجة خلال ساعة، ويُستهلك خلال 24 ساعة، ولا يُعاد تسخينه أكثر من مرة.',
          'الدجاج ينضج عند 74°م في أسمك جزء، واللحم المفروم عند 71°م، والسمك عند 63°م.',
          'أدوات اللحم النيئ منفصلة عن الخضراوات الجاهزة للأكل، وغسل اليدين والأسطح بعد ملامستها.',
          'الرائحة وحدها ليست حكمًا على سلامة الطعام.',
        ]} />
        <p className="mt-3 text-[13px] text-muted">
          المرجع: وكالة معايير الغذاء البريطانية (<a className="link-inline" href="https://www.food.gov.uk/safety-hygiene/chilling" target="_blank" rel="noopener noreferrer">التبريد</a> ·{' '}
          <a className="link-inline" href="https://www.food.gov.uk/safety-hygiene/cooking-your-food" target="_blank" rel="noopener noreferrer">الطهي الآمن</a>). تُتبع الإرشادات المحلية وتعليمات العبوة دائمًا.
        </p>
      </Section>

      <Section icon="wallet" title="أفكار للتوفير وتقليل الهدر">
        <List items={[
          'الخطة تعيد استخدام الطماطم والخيار والزبادي والخبز في أكثر من وجبة؛ استبدال وجبة بأخرى من الخطة نفسها أوفر من إدخال مكونات جديدة.',
          'ثلاث وجبات طوارئ لا تحتاج تخطيطًا: سلطة التونة، مائدة اللبنة، الفول. مكوناتها تُخزن طويلًا.',
          'فائض العبوات يظهر في تفاصيل كل صنف؛ فائض الدجاج المجمد والأرز والعدس يغطي جزءًا من الدورة القادمة.',
          'مقارنة سعر الكيلو لا سعر العبوة، وتسجيل سعر فرعك في تبويب الميزانية.',
          'قبل الدورة التالية: ما الذي تبقى؟ ما الذي نفد مبكرًا؟ أي وجبة أخذت وقتًا أطول؟ عدّل الخطة بدل البدء من الصفر.',
        ]} />
      </Section>

      <Section icon="alert" title="الحساسية والمكونات المستبعدة" open={state.avoidAllergens.length + state.avoidIngredients.length > 0}>
        <p className="text-muted">ما تحدده هنا يظهر تنبيهًا على الوجبات في الخطة والمكتبة، ويقدّم البدائل الخالية منه عند التبديل. التنبيه مبني على بيانات المكونات؛ ملصق المنتج هو المرجع.</p>
        <p className="mb-2 mt-3 font-bold">مسببات الحساسية لدى الأسرة</p>
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_ORDER.map((a) => (
            <Chip key={a} active={state.avoidAllergens.includes(a)} onClick={() => set((s) => ({ avoidAllergens: s.avoidAllergens.includes(a) ? s.avoidAllergens.filter((x) => x !== a) : [...s.avoidAllergens, a] }))}>
              {ALLERGENS[a]}
            </Chip>
          ))}
        </div>
        <p className="mb-2 mt-4 font-bold">مكونات لا ترغب بها الأسرة</p>
        <div className="flex flex-wrap gap-2">
          {INGREDIENTS.filter((i) => !i.nobuy && i.unit !== 'none').map((i) => (
            <Chip key={i.id} active={state.avoidIngredients.includes(i.id)} onClick={() => set((s) => ({ avoidIngredients: s.avoidIngredients.includes(i.id) ? s.avoidIngredients.filter((x) => x !== i.id) : [...s.avoidIngredients, i.id] }))}>
              {i.name.replace(/\s*\(.*\)$/, '')}
            </Chip>
          ))}
        </div>
        {(() => {
          const hit = state.nights.map((id, n) => ({ n: n + 1, r: RECIPE[id] })).filter(({ r }) => hasConflict(recipeConflicts(r, state)));
          return hit.length > 0 && (
            <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
              في الخطة الحالية: {hit.map(({ n, r }) => `الليلة ${n} (${r.title})`).join('، ')}.
            </p>
          );
        })()}
      </Section>

      <Section icon="more" title="الإعدادات">
        <p className="text-muted">المكونات الاختيارية تُفعَّل وتُلغى من صفحة كل وصفة.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => { if (confirm('إلغاء كل علامات الشراء؟')) { set((s) => ({ checked: {}, custom: s.custom.map((c) => ({ ...c, checked: false })) })); toast('أُلغيت العلامات.'); } }}>
            إلغاء علامات الشراء
          </Button>
          <Button variant="outline" onClick={() => { if (confirm('حذف كل الأسعار المسجلة لكل المتاجر والعودة إلى الأسعار الافتراضية؟')) { set({ priceBook: [], storeMode: 'auto' }); toast('حُذف سجل الأسعار وأُعيدت الأسعار الافتراضية.'); } }}>
            إعادة الأسعار الافتراضية
          </Button>
          <Button variant="danger" className="sm:col-span-2" onClick={() => {
            if (confirm('سيُحذف كل شيء: الخطة، الأصناف الإضافية، الأسعار، العلامات. يُنصح بحفظ نسخة احتياطية أولًا. متابعة؟')) { replace(defaultState()); toast('أُعيد ضبط الدليل.'); }
          }}>إعادة ضبط كاملة</Button>
        </div>
      </Section>

      <Section icon="download" title="النسخ الاحتياطي والنقل بين الأجهزة">
        <p className="text-muted">البيانات محفوظة في هذا المتصفح فقط. لنقلها إلى هاتف آخر: حفظ نسخة ثم استعادتها هناك. يقبل الاستيراد أيضًا نسخ الإصدار الأول والنسخة الثانية (ملفا HTML).</p>
        {!persisted && <p className="mt-2 rounded-xl bg-warn-soft p-3 text-warn">المتصفح يمنع الحفظ المحلي (ربما وضع التصفح الخاص). ستضيع التعديلات عند الإغلاق؛ احفظ نسخة احتياطية.</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" icon="download" onClick={doExport}>حفظ نسخة</Button>
          <Button variant="soft" icon="upload" onClick={() => file.current?.click()}>استعادة نسخة</Button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
      </Section>

      <Section icon="info" title="عن الدليل وحدوده">
        <List items={[
          'لا حساب ولا خادم: لا تغادر بياناتك هذا الجهاز.',
          'الكميات محسوبة لحصص متوسطة لخمسة أفراد وتُحجَّم آليًا؛ الثوم والبصل والليمون والزيت تُحجَّم جزئيًا لأنها لا تتضاعف مع عدد الأفراد.',
          'الأسعار الموثقة صحيحة بتاريخها فقط، والتقديرات للتخطيط. لا توجد مقارنة آلية بين المتاجر.',
          'التذكيرات المضمونة هي التي تُضاف إلى تقويم الهاتف (من تبويب الخطة)، لا الصفحة نفسها.',
          'الدليل ليس بديلًا عن نصيحة مختص تغذية عند وجود حالة صحية أو حساسية غذائية.',
        ]} />
        <p className="mt-3 text-[12.5px] text-muted">الإصدار 2.0 · bassamailab.xyz</p>
      </Section>
    </div>
  );
}
