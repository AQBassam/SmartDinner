import { useState, type ReactNode } from 'react';
import { useInstall, type Platform } from '../lib/install';
import { Button, Icon, useToast } from './ui';

/** A control's name as the phone shows it, in Arabic and in English, since phones run either language. */
function Ui({ ar, en }: { ar: string; en: string }) {
  return <><b className="font-bold">«{ar}»</b> <span className="whitespace-nowrap text-muted" dir="ltr">({en})</span></>;
}

function Key({ icon }: { icon: string }) {
  return <span className="mx-0.5 inline-grid size-7 place-items-center rounded-lg border border-line bg-paper align-middle text-ink"><Icon name={icon} className="size-[18px]" /></span>;
}

const STEPS: Record<Exclude<Platform, 'desktop'>, { title: string; steps: ReactNode[]; note?: ReactNode }> = {
  android: {
    title: 'أندرويد، متصفح Chrome',
    steps: [
      <>زر القائمة <Key icon="kebab" /> أعلى الشاشة.</>,
      <><Ui ar="تثبيت التطبيق وإنشاء اختصار" en="Install and create shortcut" />، واسمه في النسخ الأقدم <Ui ar="إضافة إلى الشاشة الرئيسية" en="Add to Home screen" />.</>,
      <>في النافذة التالية: <Ui ar="تثبيت" en="Install" />.</>,
    ],
  },
  ios: {
    title: 'آيفون، متصفح Safari',
    steps: [
      <>زر المشاركة <Key icon="share" /> أسفل الشاشة. وفي iOS 26: زر النقاط <Key icon="ellipsis" /> بجانب شريط العنوان، ثم <Ui ar="مشاركة" en="Share" />.</>,
      <>للأسفل قليلًا، ثم <Ui ar="إضافة إلى الشاشة الرئيسية" en="Add to Home Screen" />.</>,
      <>يبقى خيار <span dir="ltr" className="font-bold">Open as Web App</span> مفعّلًا إن ظهر، ثم <Ui ar="إضافة" en="Add" />.</>,
    ],
    note: <>في Chrome على الآيفون: زر المشاركة في شريط العنوان، ثم «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).<br />
      على الآيفون يحتفظ التطبيق المثبّت ببياناته منفصلة عن Safari، فيبدأ من جديد. ما سُجّل في Safari يُنقل إليه بـ«حفظ نسخة» ثم «استعادة نسخة» من «المزيد».</>,
  },
};

/**
 * Install the guide as an app. Where Chrome offers its own install dialog, one button opens it;
 * otherwise the steps for this phone come first and the other phone's steps sit behind a disclosure.
 */
export function InstallGuide({ compact = false }: { compact?: boolean }) {
  const { platform, installed, installedHere, canPrompt, prompt } = useInstall();
  const toast = useToast();
  const [other, setOther] = useState(false);

  if (installed) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-teal-soft p-3 text-[14px] font-bold text-teal-deep">
        <Icon name="check" className="size-5 shrink-0" />
        {installedHere ? 'ثُبّت الدليل. يفتح من أيقونته على الشاشة الرئيسية، وكل بياناتك فيه.' : 'الدليل مثبّت على هذا الجهاز ويعمل كتطبيق.'}
      </p>
    );
  }
  const first: Exclude<Platform, 'desktop'> = platform === 'ios' ? 'ios' : 'android';
  const second = first === 'ios' ? 'android' : 'ios';

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-[14px] leading-relaxed text-ink/80">
          يظهر الدليل بأيقونة على الشاشة الرئيسية ويفتح بملء الشاشة كأي تطبيق، ويعمل دون إنترنت بعد أول فتح. لا متجر تطبيقات ولا تحميل.
        </p>
      )}
      {canPrompt && (
        <Button variant="primary" icon="download" className="w-full" onClick={async () => {
          if (await prompt()) toast('ثُبّت الدليل. أيقونته على الشاشة الرئيسية.');
        }}>تثبيت التطبيق</Button>
      )}
      {platform === 'desktop' && !canPrompt && (
        <p className="text-[13.5px] leading-relaxed text-muted">على الحاسوب: أيقونة التثبيت في طرف شريط العنوان في Chrome وEdge. والأنفع تثبيته على الهاتف بالخطوات التالية.</p>
      )}
      <Steps p={first} lead={canPrompt ? 'أو يدويًا:' : undefined} />
      <button className="link text-[13.5px]" aria-expanded={other} onClick={() => setOther(!other)}>
        {other ? 'إخفاء' : 'عرض'} الخطوات على {second === 'ios' ? 'آيفون' : 'أندرويد'}
      </button>
      {other && <Steps p={second} />}
    </div>
  );
}

function Steps({ p, lead }: { p: Exclude<Platform, 'desktop'>; lead?: string }) {
  const s = STEPS[p];
  return (
    <div className="rounded-2xl border border-line bg-paper p-3.5">
      <p className="mb-2 flex items-center gap-2 text-[14px] font-extrabold"><Icon name="phone" className="size-[18px] text-teal" />{lead ? `${lead} ` : ''}{s.title}</p>
      <ol className="space-y-2 text-[14px] leading-[1.9]">
        {s.steps.map((x, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="num mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-teal-soft text-[12.5px] font-extrabold text-teal-deep">{i + 1}</span>
            <span>{x}</span>
          </li>
        ))}
      </ol>
      {s.note && <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{s.note}</p>}
    </div>
  );
}
