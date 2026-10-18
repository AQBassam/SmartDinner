import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ORDER, RECIPES } from './lib/data';
import { generate, type Generated, type PlanInput } from './lib/engine';
import { todayISO } from './lib/format';
import { buildSchedule, scheduleEvents, type CalendarEvent, type DayPlan } from './lib/schedule';
export { togglePrep } from './lib/schedule';
import { loadState, members, servings, STORAGE_KEY, type AppState, type ImportSource } from './lib/state';

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const k = '__sdg_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

export function planInput(state: AppState, today = todayISO()): PlanInput {
  return {
    servings: servings(state), members: members(state), startDate: state.startDate, nights: state.nights,
    optionalOff: state.optionalOff, have: state.have, stock: state.stock, priceBook: state.priceBook,
    storeMode: state.storeMode, today,
  };
}

export interface Store {
  state: AppState;
  gen: Generated;
  input: PlanInput;
  days: Map<string, DayPlan>;
  events: CalendarEvent[];
  set: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  replace: (s: AppState) => void;
  persisted: boolean;
  migratedFrom?: ImportSource;
}

export function useStore(): Store {
  const storage = useRef<Storage | null>(typeof window === 'undefined' ? null : safeStorage());
  const [boot] = useState(() => loadState(storage.current));
  const [state, setState] = useState<AppState>(boot.state);

  useEffect(() => {
    try {
      storage.current?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota or private mode: the app keeps working in memory */
    }
  }, [state]);

  const set = useCallback<Store['set']>((patch) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  const today = todayISO();
  const input = useMemo(() => planInput(state, today), [state, today]);
  const gen = useMemo(() => generate(input), [input]);
  const days = useMemo(() => buildSchedule({ startDate: state.startDate, nights: state.nights, times: state.times }, gen), [state.startDate, state.nights, state.times, gen]);
  const events = useMemo(
    () => scheduleEvents({ startDate: state.startDate, nights: state.nights, times: state.times }, gen, days, state.shopTime),
    [state.startDate, state.nights, state.times, state.shopTime, gen, days],
  );

  return { state, gen, input, days, events, set, replace: setState, persisted: !!storage.current, migratedFrom: boot.migratedFrom };
}

/** Resize the plan, keeping the family's choices and filling new nights from the default order. */
export function resizeNights(nights: string[], count: number): string[] {
  if (count <= nights.length) return nights.slice(0, count);
  const out = [...nights];
  const unused = [...DEFAULT_ORDER, ...RECIPES.map((r) => r.id).filter((id) => !DEFAULT_ORDER.includes(id))].filter((id) => !out.includes(id));
  let i = 0;
  while (out.length < count) {
    out.push(unused.length ? unused.shift()! : DEFAULT_ORDER[i++ % DEFAULT_ORDER.length]);
  }
  return out;
}

