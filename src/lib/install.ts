// Install-as-app support: which phone this is, whether the guide already runs as an installed app,
// and Chrome's own install prompt (beforeinstallprompt) when the browser offers it.
import { useEffect, useState } from 'react';

export type Platform = 'ios' | 'android' | 'desktop';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** Called once from main.tsx, before React renders, so an early event is not missed. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; installedNow = true; notify(); });
}

export function detectPlatform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return 'ios'; // iPadOS reports a Mac
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return {
    platform: detectPlatform(),
    installed: installedNow || isStandalone(),
    /** installed from this browser tab just now; the app itself opens from its home-screen icon */
    installedHere: installedNow && !isStandalone(),
    canPrompt: !!deferred,
    /** Chrome's own dialog; resolves true when the person accepted */
    prompt: async (): Promise<boolean> => {
      const e = deferred;
      if (!e) return false;
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred = null; notify();
      return outcome === 'accepted';
    },
  };
}
