import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type AnimateScrollOptions = {
  duration?: number; // ms
  minDuration?: number;
  maxDuration?: number;
  offset?: number; // px (e.g., fixed header)
};

let rafId: number | null = null;
let cleanupFns: Array<() => void> = [];

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = () => {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
};

const stopActiveAnimation = () => {
  if (rafId !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(rafId);
  }
  rafId = null;
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
};

export const animateScrollTo = (targetY: number, opts: AnimateScrollOptions = {}) => {
  if (typeof window === "undefined") return;

  stopActiveAnimation();

  const html = document.documentElement;
  const prevBehavior = html.style.scrollBehavior;
  // Prevent CSS `scroll-behavior: smooth` from fighting the animation (causes lag/jank).
  html.style.scrollBehavior = "auto";
  cleanupFns.push(() => {
    html.style.scrollBehavior = prevBehavior;
  });

  const offset = opts.offset ?? 0;
  const startY = window.scrollY || window.pageYOffset || 0;
  const clampedTarget = Math.max(0, targetY - offset);
  const distance = clampedTarget - startY;

  if (prefersReducedMotion() || Math.abs(distance) < 2) {
    window.scrollTo(0, clampedTarget);
    stopActiveAnimation();
    return;
  }

  const minDuration = opts.minDuration ?? 900;
  const maxDuration = opts.maxDuration ?? 2000;
  // Distance-based duration feels “premium” (small jumps are quick, big jumps are slower).
  const computed = Math.min(maxDuration, Math.max(minDuration, Math.abs(distance) * 0.85));
  const duration = opts.duration ?? computed;

  const startTime = performance.now();

  // Cancel animation if user takes over (wheel/touch/keyboard).
  const cancel = () => stopActiveAnimation();
  const wheelOpts: AddEventListenerOptions = { passive: true };
  window.addEventListener("wheel", cancel, wheelOpts);
  window.addEventListener("touchstart", cancel, wheelOpts);
  window.addEventListener("keydown", cancel, wheelOpts);
  cleanupFns.push(() => window.removeEventListener("wheel", cancel, wheelOpts));
  cleanupFns.push(() => window.removeEventListener("touchstart", cancel, wheelOpts));
  cleanupFns.push(() => window.removeEventListener("keydown", cancel, wheelOpts));

  const step = (now: number) => {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(t);
    window.scrollTo(0, startY + distance * eased);

    if (t < 1) {
      rafId = window.requestAnimationFrame(step);
    } else {
      stopActiveAnimation();
    }
  };

  rafId = window.requestAnimationFrame(step);
};

export const animateScrollToId = (id: string, opts: AnimateScrollOptions = {}) => {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const targetY = (window.scrollY || window.pageYOffset || 0) + rect.top;
  animateScrollTo(targetY, opts);
};
