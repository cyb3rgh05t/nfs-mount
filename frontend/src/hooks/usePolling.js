import { useEffect, useRef } from "react";

/**
 * Run `fn` immediately and then every `intervalMs` milliseconds while the tab
 * is visible. When the tab is hidden the timer is paused; when it becomes
 * visible again `fn` runs once and the interval resumes.
 *
 * Returning `false` from `fn` (or throwing) does not stop the loop.
 *
 * @param {() => any | Promise<any>} fn - work to run on each tick
 * @param {number} intervalMs - polling interval in ms
 * @param {boolean} [enabled=true] - set to false to disable the loop entirely
 *   (useful for "logged out" states)
 */
export function usePolling(fn, intervalMs, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;

    let timer = null;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      try {
        fnRef.current();
      } catch {
        /* swallow – page-level error handling is the caller's job */
      }
    };

    const start = () => {
      if (timer != null) return;
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer == null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick(); // catch up immediately
        start();
      } else {
        stop();
      }
    };

    // initial run + start (only if visible)
    tick();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
