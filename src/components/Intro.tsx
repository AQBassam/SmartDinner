import { useState } from 'react';
import { arCount, fmtTime } from '../lib/format';
import type { Store } from '../store';
import { HouseholdEditor } from './HouseholdEditor';
import { InstallGuide } from './InstallGuide';
import { useInstall } from '../lib/install';
import { Button, Plate } from './ui';

/** First visit: what the guide does, in three screens, the family size, and on a phone how to install it. */
export function Intro({ store }: { store: Store }) {
  const { state, set } = store;
  const [step, setStep] = useState(0);
  const install = useInstall();
  // decided once: installing during the intro must not remove the step the person is standing on
  const [withInstall] = useState(() => install.platform !== 'desktop' && !install.installed);
  if (state.seenIntro) return null;
  const t = state.times;
  const steps = [
    {
      art: <div className="flex items-center justify-center"><Plate emoji="🌯" tint="#F6D9A8" size={72} /><Plate emoji="🍲" tint="#F8CF96" size={88} className="relative z-10 -mx-3" /><Plate emoji="🐟" tint="#CFE3EE" size={72} /></div>,
      title: 'سؤال العشاء محسوم مسبقًا',
      body: `خطة من ${arCount(state.nights.length, ['ليلة', 'ليلتين', 'ليالٍ', 'ليلة'])}، لكل ليلة عشاء سريع ومشبع. قائمة التسوق تُكتب وحدها من الوصفات وعدد أفراد الأسرة.`,
    },
    {
      art: <div className="flex justify-center gap-3 emoji text-[44px]" aria-hidden="true"><span>🛒</span><span>🔪</span><span>🍳</span></div>,
      title: 'دقائق في أوقات موجودة أصلًا',
      body: `بعد التسوق تُقسَّم اللحوم وتُغسل الخضار. وفي المساء (${fmtTime(t.prep)})، مع تجهيز غداء الغد، تُذاب حصة الغد ويُقطَّع ما يلزم. وبعد الغداء (${fmtTime(t.ask)}) يكون عشاء الليلة معروفًا، ومعه موعد بدء طهيه ليجهز ${fmtTime(t.dinner)}.`,
    },
    {
      art: <div className="flex justify-center gap-3"><Plate emoji="🫘" tint="#E8D2BC" size={72} /><Plate emoji="🥗" tint="#D3EBCB" size={72} /></div>,
      title: 'يوم بلا طاقة؟',
      body: 'زر «ما عندي طاقة الليلة» يقدّم وجبة جاهزة في 15 دقيقة، ويؤجل وجبة الليلة إلى الغد كما هي، فلا يضيع شيء.',
    },
  ];
  const family = step === steps.length;
  const last = step === steps.length + (withInstall ? 1 : 0);
  const finish = () => set({ seenIntro: true });

  return (
    <div className="no-print fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(42_27_45/0.5)] sm:items-center" role="dialog" aria-modal="true" aria-label="مرحبًا بك">
      <div className="sheet-in w-full max-w-lg rounded-t-[28px] bg-sand px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-6 sm:rounded-[28px]">
        {step < steps.length ? (
          <div className="min-h-[300px] text-center">
            <div className="py-3">{steps[step].art}</div>
            <h2 className="mt-4 text-[22px] font-extrabold leading-snug">{steps[step].title}</h2>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink/80">{steps[step].body}</p>
          </div>
        ) : !family ? (
          <div className="max-h-[62vh] min-h-[300px] overflow-y-auto">
            <h2 className="text-center text-[22px] font-extrabold">ثبّته على هاتفك</h2>
            <p className="mb-4 mt-1 text-center text-[14px] text-muted">أيقونة على الشاشة الرئيسية، يفتح بملء الشاشة ويعمل دون إنترنت. والخطوات باقية في تبويب «المزيد».</p>
            <InstallGuide compact />
          </div>
        ) : (
          <div className="min-h-[300px]">
            <h2 className="text-center text-[22px] font-extrabold">كم شخصًا على العشاء؟</h2>
            <p className="mb-4 mt-1 text-center text-[14px] text-muted">الكميات وقائمة التسوق تُحسب على هذا العدد، ويمكن تغييره لاحقًا من الخطة.</p>
            <HouseholdEditor store={store} />
          </div>
        )}
        <div className="mt-5 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5" aria-hidden="true">
            {[...steps, null, ...(withInstall ? [null] : [])].map((_, i) => <span key={i} className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-teal' : 'w-2 bg-line'}`} />)}
          </div>
          {!last && !family && <button className="min-h-11 px-3 text-[14px] font-bold text-muted" onClick={finish}>تخطٍّ</button>}
          {last && withInstall && !install.installed && <button className="min-h-11 px-3 text-[14px] font-bold text-muted" onClick={finish}>لاحقًا</button>}
          <Button variant="primary" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? 'ابدأ' : 'التالي'}</Button>
        </div>
      </div>
    </div>
  );
}
