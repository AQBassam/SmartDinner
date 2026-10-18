import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

// ---------------------------------------------------------------- icons
const paths: Record<string, string> = {
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  cart: 'M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  book: 'M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4V4zM5 16a4 4 0 0 1 4-4h9',
  wallet: 'M4 7a2 2 0 0 1 2-2h12v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  share: 'M12 4v11M7 9l5-5 5 5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 4.5l3 2 3-2M9 19.5l3-2 3 2',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  flame: 'M12 21c3.9 0 6-2.6 6-6 0-3.5-2.5-5.5-3.5-8.5-1.5 2-2 3-2.5 4.5C11 9 10 7.5 10 5c-3 2.5-4 6-4 9.5 0 3.7 2.1 6.5 6 6.5z',
  download: 'M12 4v11M7 10l5 5 5-5M5 19h14',
  upload: 'M12 15V4M7 9l5-5 5 5M5 19h14',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  chef: 'M7 14v6h10v-6M7 14a4 4 0 1 1 1.5-7.7A4 4 0 0 1 16 5a3.5 3.5 0 0 1 1 6.9V14',
  timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0',
};
export function Icon({ name, className = 'size-5' }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name] ?? paths.info} />
    </svg>
  );
}

// ---------------------------------------------------------------- dish visuals
export function Plate({ emoji, tint, size = 56, className = '' }: { emoji: string; tint: string; size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`plate ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ['--tint' as string]: tint }}>
      {emoji}
    </span>
  );
}

/** Small coloured tile with a glyph: task kinds, shopping aisles. */
export function Glyph({ emoji, bg, size = 36 }: { emoji: string; bg: string; size?: number }) {
  return (
    <span aria-hidden="true" className="emoji inline-grid shrink-0 place-items-center rounded-xl"
      style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.5) }}>
      {emoji}
    </span>
  );
}

// ---------------------------------------------------------------- primitives
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card rounded-2xl border border-line bg-paper shadow-[var(--shadow-card)] ${className}`}>{children}</section>;
}

type Tone = 'teal' | 'copper' | 'ok' | 'warn' | 'ice' | 'muted' | 'danger';
const toneCls: Record<Tone, string> = {
  teal: 'bg-teal-soft text-teal-deep',
  copper: 'bg-copper-soft text-copper',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  ice: 'bg-ice-soft text-ice',
  muted: 'bg-sand-2 text-muted',
  danger: 'bg-danger-soft text-danger',
};
export function Badge({ tone = 'muted', children, icon }: { tone?: Tone; children: ReactNode; icon?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${toneCls[tone]}`}>
      {icon && <Icon name={icon} className="size-3.5" />}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger';
const btnCls: Record<BtnVariant, string> = {
  primary: 'bg-teal text-white hover:bg-teal-deep',
  soft: 'bg-teal-soft text-teal-deep hover:bg-[#d3e7d9]',
  ghost: 'text-teal-deep hover:bg-teal-soft',
  outline: 'border border-line bg-paper text-ink hover:bg-sand',
  danger: 'bg-danger-soft text-danger hover:bg-[#f6d9d6]',
};
export function Button({ variant = 'soft', icon, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: string }) {
  return (
    <button {...rest} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-bold transition active:scale-[.98] disabled:opacity-40 ${btnCls[variant]} ${className}`}>
      {icon && <Icon name={icon} className="size-[18px]" />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button {...rest} aria-label={label} title={label}
      className={`inline-grid size-10 place-items-center rounded-xl text-muted transition hover:bg-sand-2 hover:text-ink disabled:opacity-30 ${className}`}>
      <Icon name={icon} />
    </button>
  );
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <div>
        <h2 className="text-[17px] font-extrabold">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="checkbox" aria-checked={checked} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 transition ${checked ? 'border-teal bg-teal text-white' : 'border-[#c9bfae] bg-paper text-transparent'}`}>
      <Icon name="check" className="size-4" />
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-start">
      <span className="text-[15px]">{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-teal' : 'bg-[#d6cdbf]'}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${checked ? 'right-6' : 'right-1'}`} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- sheet
export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[rgb(20_30_32/0.45)]" onClick={onClose} />
      <div ref={ref} tabIndex={-1}
        className={`sheet-in relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-sand outline-none sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="text-[17px] font-extrabold">{title}</h3>
          <IconButton icon="x" label="إغلاق" onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- toast
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="no-print">
        {msg && (
          <div className="toast-in fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] left-1/2 z-[60] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-2xl bg-teal-deep px-4 py-3 text-center text-[14px] text-white shadow-lg">
            {msg}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
