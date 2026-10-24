import { useRef, useState, type ReactNode } from 'react';
import { ALLERGEN_ORDER, ALLERGENS, INGREDIENTS, RECIPE, RECIPES } from '../lib/data';
import { defaultState, exportBackup, importBackup } from '../lib/state';
import type { TabId } from '../App';
import { addDays, fmtTime } from '../lib/format';
import { minutesOf } from '../lib/schedule';
import { encodeShare } from '../lib/share';
import { link, linkCode, sharePlan, unlink, useLink } from '../lib/luban';
import type { Store } from '../store';
import { useInstall } from '../lib/install';
import { InstallGuide } from './InstallGuide';
import { Chip } from './PlanTab';
import { hasConflict, recipeConflicts } from './shared';
import { Button, Icon, download, useConfirm, useToast } from './ui';

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
  const install = useInstall();
  const ask = useConfirm();

  const doExport = () => {
    download(`دليل-العشاء-نسخة-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(state), 'application/json;charset=utf-8');
    toast('جُهّزت النسخة الاحتياطية.');
  };
  const luban = useLink();
  const [lubanOpen] = useState(() => !!luban); // opened when linked, then left as the reader leaves it
  const copyForLuban = async () => {
    try {
      const code = await encodeShare(sharePlan({ state, gen }));
      await navigator.clipboard.writeText(code);
      toast('نُسخ رمز الخطة. الصقه في صفحة إعدادات لُبان.');
    } catch {
      toast('تعذر النسخ في هذا المتصفح.');
    }
  };
  const copyLink = async () => {
    if (!luban) return;
    try {
      await navigator.clipboard.writeText(linkCode(luban.id));
      toast('نُسخ رمز الربط. الصقه في صفحة إعدادات لُبان ثم «حفظ».');
    } catch {
      toast('تعذر النسخ في هذا المتصفح.');
    }
  };
  const doLink = async () => {
    try {
      const l = await link(JSON.stringify(sharePlan({ state, gen })));
      toast(l.error ? 'رُبطت، لكن تعذّر الإرسال الآن؛ يُعاد بعد دقيقة.' : 'رُبطت الخطة بشاشة لُبان. انسخ رمز الربط والصقه في إعدادات لُبان.');
    } catch {
      toast('تعذّر الربط في هذا المتصفح.');
    }
  };
  const doUnlink = async () => {
    if (!await ask({ title: 'فك الربط بشاشة لُبان', body: 'تُحذف الخطة من خادم لُبان، وتتوقف الشاشة عن تلقي التعديلات. يبقى ما عندها حتى تزيله من إعدادات لُبان.', action: 'فك الربط' })) return;
    await unlink();
    toast('فُك الربط وحُذفت الخطة من خادم لُبان.');
  };
  const clock = (ms: number) => new Intl.DateTimeFormat('ar-OM-u-nu-latn', { hour: 'numeric', minute: '2-digit' }).format(ms);
  const doImport = async (f: File) => {
    try {
      const { state: s, from, notes } = importBackup(await f.text());
      if (!await ask({ title: 'استعادة النسخة', body: 'تحل النسخة المستوردة محل الخطة وقائمة التسوق والأسعار الحالية في هذا الجهاز.', action: 'استعادة النسخة' })) return;
      const before = state;
      replace({ ...s, seenIntro: true }); // a restored family is not a first visit
      const label = { v1: 'الإصدار الأول', 'html-v2': 'النسخة الثانية (HTML)', 'react-v2': 'نسخة المعاينة السابقة', v3: 'نسخة احتياطية' }[from];
      toast(`استُعيدت ${label}.${notes.length ? ' ' + notes.join(' ') : ''}`, { label: 'تراجع', run: () => replace(before) });
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

      <Section icon="phone" title={install.installed ? 'التطبيق على الهاتف' : 'تثبيت الدليل كتطبيق على الهاتف'} open={!install.installed && install.platform !== 'desktop'}>
        <InstallGuide />
      </Section>

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
              <p className="mb-2 mt-4 font-bold text-teal-deep">يوم التسوق: {shops.map((m, i) => <span key={i}>{i ? '، ' : ''}<span className="num">{m}</span></span>)} دقيقة للدفعات بالترتيب</p>
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
          <Button variant="outline" onClick={() => {
            const before = { checked: state.checked, custom: state.custom };
            set((s) => ({ checked: {}, custom: s.custom.map((c) => ({ ...c, checked: false })) }));
            toast('أُلغيت علامات الشراء.', { label: 'تراجع', run: () => set(before) });
          }}>
            إلغاء علامات الشراء
          </Button>
          <Button variant="outline" onClick={async () => {
            if (!await ask({ title: 'إعادة الأسعار الافتراضية', body: `يُحذف ${state.priceBook.length} سعرًا سجلتها الأسرة لكل المتاجر، وتعود القائمة والميزانية إلى أسعار لولو الموثقة.`, action: 'حذف الأسعار المسجلة', danger: true })) return;
            const before = { priceBook: state.priceBook, storeMode: state.storeMode };
            set({ priceBook: [], storeMode: 'auto' });
            toast('حُذفت الأسعار المسجلة.', { label: 'تراجع', run: () => set(before) });
          }}>
            إعادة الأسعار الافتراضية
          </Button>
          <Button variant="danger" className="sm:col-span-2" onClick={async () => {
            if (!await ask({ title: 'إعادة ضبط كاملة', body: 'يُحذف كل شيء في هذا الجهاز: الخطة، والأسرة، وقائمة التسوق، والأصناف الإضافية، والأسعار، والعلامات. «حفظ نسخة» أولًا يتيح استعادتها لاحقًا.', action: 'حذف كل البيانات', danger: true })) return;
            const before = state;
            replace(defaultState());
            toast('أُعيد ضبط الدليل.', { label: 'تراجع', run: () => replace(before) });
          }}>إعادة ضبط كاملة</Button>
        </div>
      </Section>

      <Section icon="home" title="عرض الخطة على شاشة لُبان" open={lubanOpen}>
        <p className="text-muted">لُبان شاشة توقف وواجهة للتلفزيون. تعرض بطاقة «عشاء الليلة» ومهام اليوم بمواعيدها، وتعيد دورة الخطة (<span className="num">{state.nights.length}</span> ليلة) وحدها كلما اكتملت.</p>
        {luban ? (
          <>
            <p className="mt-3 font-bold text-teal-deep">مرتبطة بشاشة لُبان</p>
            <p className="mt-1 text-muted">الصق هذا الرمز مرة واحدة في صفحة إعدادات لُبان على الجوال (تبويب «البيت» ← خطة العشاء)، ثم «حفظ». بعدها يصل كل تعديل في الخطة إلى الشاشة خلال 10 دقائق.</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-teal-soft/40 px-3 py-2">
              <code dir="ltr" className="num min-w-0 flex-1 break-all text-[13px] leading-snug" data-testid="luban-code">{linkCode(luban.id)}</code>
              <Button variant="soft" icon="copy" onClick={copyLink}>نسخ</Button>
            </div>
            <p className={`mt-2 text-[13.5px] ${luban.error ? 'text-danger' : 'text-muted'}`} role="status">
              {luban.error ? 'تعذّر الإرسال إلى لُبان؛ يُعاد بعد دقيقة.'
                : luban.sentAt ? <>أُرسلت الخطة إلى لُبان ✓ الساعة <span className="num">{clock(luban.sentAt)}</span></>
                : 'تُرسل الخطة الآن…'}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={copyForLuban}>نسخ رمز الخطة</Button>
              <Button variant="outline" onClick={doUnlink}>فك الربط</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-muted"><b>الربط</b> يرسل الخطة إلى خادم لُبان عند كل تعديل، فلا تلصق شيئًا بعد المرة الأولى. أو <b>رمز الخطة</b>: يُلصق من جديد كلما غيّرت الوجبات أو المواعيد، ولا يغادر هذا الجهاز إلا بيدك.</p>
            <p className="mt-2 text-[13px] text-muted">في الحالتين: أطباق ومواعيد ومهام فقط، بلا أسماء ولا أسعار ولا قائمة تسوق.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="primary" icon="link" onClick={doLink}>اربط بشاشة لُبان</Button>
              <Button variant="soft" icon="copy" onClick={copyForLuban}>نسخ رمز الخطة</Button>
            </div>
          </>
        )}
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
          'لا حساب ولا خادم: لا تغادر بياناتك هذا الجهاز. الاستثناء الوحيد إن ربطت الخطة بشاشة لُبان: تُرسل أطباقها ومواعيدها ومهامها إلى خادم لُبان، بلا أسماء ولا أسعار، وتُحذف منه عند فك الربط.',
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
