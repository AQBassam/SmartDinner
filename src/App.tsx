import { lazy, Suspense, useEffect, useState } from 'react';
import { MoreTab } from './components/MoreTab';
import { PlanTab } from './components/PlanTab';
import { RecipeSheet } from './components/RecipeView';
import { RecipesTab, type RecipePreset } from './components/RecipesTab';
import { TodayTab } from './components/TodayTab';
import { Intro } from './components/Intro';
import { ShopTab } from './components/ShopTab';
import { ConfirmProvider, Icon, ToastProvider } from './components/ui';
import { arCount, fmtDate, PERSON, todayISO } from './lib/format';
import { members } from './lib/state';
import { useStore } from './store';
import { useLubanSync } from './lib/luban';

const BudgetTab = lazy(() => import('./components/BudgetTab').then((m) => ({ default: m.BudgetTab })));

const MIGRATION_LABEL = { 'html-v2': 'النسخة الثانية (ملف HTML)', 'react-v2': 'نسخة المعاينة السابقة', v1: 'الإصدار الأول', v3: 'نسخة سابقة' } as const;

const TABS = [
  { id: 'today', label: 'اليوم', icon: 'home' },
  { id: 'plan', label: 'الخطة', icon: 'calendar' },
  { id: 'shop', label: 'التسوق', icon: 'cart' },
  { id: 'recipes', label: 'الوصفات', icon: 'book' },
  { id: 'more', label: 'المزيد', icon: 'more' },
  { id: 'budget', label: 'الميزانية', icon: 'wallet' }, // reached from Shop and More, not the bottom bar
] as const;
export type TabId = (typeof TABS)[number]['id'];
const NAV = TABS.filter((t) => t.id !== 'budget');

function readHash(): TabId {
  const h = window.location.hash.replace('#', '');
  return (TABS.find((t) => t.id === h)?.id ?? 'today') as TabId;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'صباح الخير' : 'مساء الخير';
}

export default function App() {
  const store = useStore();
  useLubanSync(store); // linked to a Luban screen: the plan follows every change
  const [tab, setTab] = useState<TabId>(readHash);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [migrationSeen, setMigrationSeen] = useState(false);
  const [kitchenFirst, setKitchenFirst] = useState(false);
  const [preset, setPreset] = useState<RecipePreset | undefined>();
  const [presetKey, setPresetKey] = useState(0);
  const today = todayISO();

  useEffect(() => {
    const onHash = () => setTab(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (t: TabId) => {
    if (t !== tab) history.pushState(null, '', `#${t}`);
    setTab(t);
    window.scrollTo({ top: 0 });
  };
  const browse = (p?: RecipePreset) => { setPreset(p); setPresetKey((k) => k + 1); go('recipes'); };

  return (
    <ToastProvider>
    <ConfirmProvider>
      <header className="no-print sticky top-0 z-30 border-b border-line/60 bg-sand/92 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2.5 md:px-8 md:py-3">
          <button onClick={() => go('today')} className="flex min-w-0 flex-1 items-center gap-3 text-start lg:flex-none" aria-label="دليل العشاء المنزلي، صفحة اليوم">
            <svg viewBox="0 0 64 64" className="size-10 shrink-0" aria-hidden="true">
              <rect width="64" height="64" rx="16" fill="#2E6A4A" />
              <path d="M12 35h40a20 20 0 0 1-40 0z" fill="#E6B247" />
              <path d="M9 35h46" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              <path d="M25 27c0-3 3-3 3-6.5M32 27c0-3 3-3 3-6.5M39 27c0-3 3-3 3-6.5" stroke="#fff" strokeOpacity=".85" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
            <span className="min-w-0">
              <span className="block truncate text-[17px] font-extrabold leading-tight">دليل العشاء المنزلي</span>
              <span className="block truncate text-[12.5px] text-muted">{greeting()}، {fmtDate(today)}</span>
            </span>
          </button>
          <nav className="hidden flex-1 justify-center gap-1 lg:flex" aria-label="الأقسام">
            {NAV.map((t) => {
              const on = tab === t.id || (t.id === 'more' && tab === 'budget');
              return (
                <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-[14.5px] font-bold transition ${on ? 'bg-teal text-white' : 'text-ink hover:bg-sand-2'}`}>
                  <Icon name={t.icon} className="size-[18px]" />{t.label}
                </button>
              );
            })}
          </nav>
          <button onClick={() => go('plan')} aria-label={`${arCount(members(store.state), PERSON)} على العشاء، تعديل العدد`}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-[14px] font-bold">
            <Icon name="users" className="size-[18px] text-teal" />
            <span className="num">{members(store.state)}</span>
          </button>
        </div>
      </header>

      <main className="safe-bottom mx-auto max-w-[1200px] px-4 pt-4 md:px-8 md:pb-16 md:pt-6">
        {import.meta.env.MODE === 'singlefile' && (
          <p className="no-print mb-4 rounded-2xl bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-warn">
            نسخة معاينة: تنزيل التقويم والنسخ الاحتياطي والطباعة والمشاركة ونوافذ التأكيد تعمل في الموقع المنشور فقط.
          </p>
        )}
        {store.migratedFrom && !migrationSeen && (
          <div className="no-print mb-4 flex items-start gap-3 rounded-2xl bg-teal-soft px-4 py-3 text-[13.5px] leading-relaxed text-teal-deep">
            <span className="flex-1">نُقلت بياناتك من {MIGRATION_LABEL[store.migratedFrom]} المحفوظة في هذا المتصفح: الخطة وعدد الأفراد والأصناف الإضافية{store.migratedFrom === 'html-v2' ? ' والمخزون والأسعار' : ''}.</span>
            <button className="font-bold underline" onClick={() => setMigrationSeen(true)}>حسنًا</button>
          </div>
        )}
        {tab === 'today' && <TodayTab store={store} today={today} openRecipe={setRecipeId} cook={(id) => { setKitchenFirst(true); setRecipeId(id); }} go={go} browse={browse} />}
        {tab === 'recipes' && <RecipesTab key={presetKey} store={store} openRecipe={setRecipeId} preset={preset} />}
        <div className="mx-auto max-w-3xl">
          {tab === 'plan' && <PlanTab store={store} today={today} openRecipe={setRecipeId} />}
          {tab === 'shop' && <ShopTab store={store} today={today} go={go} />}
          {tab === 'budget' && (
            <Suspense fallback={<p className="py-10 text-center text-muted">جارٍ التحميل…</p>}><BudgetTab store={store} /></Suspense>
          )}
          {tab === 'more' && <MoreTab store={store} go={go} />}
        </div>
      </main>

      <nav className="no-print nav-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur lg:hidden" aria-label="الأقسام">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {NAV.map((t) => {
            const on = tab === t.id || (t.id === 'more' && tab === 'budget');
            return (
            <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`flex min-h-[62px] flex-col items-center justify-center gap-0.5 text-[12px] font-bold transition ${on ? 'text-teal-deep' : 'text-muted'}`}>
              <span className={`grid h-8 w-14 place-items-center rounded-full transition ${on ? 'bg-teal text-white' : ''}`}>
                <Icon name={t.icon} className="size-[21px]" />
              </span>
              {t.label}
            </button>
            );
          })}
        </div>
      </nav>

      <RecipeSheet store={store} recipeId={recipeId} kitchenFirst={kitchenFirst} onClose={() => { setRecipeId(null); setKitchenFirst(false); }} />
      {import.meta.env.MODE !== 'test' && <Intro store={store} />}
    </ConfirmProvider>
    </ToastProvider>
  );
}
