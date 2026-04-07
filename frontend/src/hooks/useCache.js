import { useState, useCallback, useRef } from "react";

/**
 * Global in-memory cache for stale-while-revalidate pattern.
 * Data survives page navigation, gets cleared on full reload.
 */
const cache = new Map();

/**
 * Like useState but backed by a global cache.
 * Returns cached data instantly on mount (no loading flash).
 *
 * @param {string} key - Unique cache key
 * @param {*} initialValue - Fallback when cache is empty
 * @returns {[any, Function, boolean]} [value, setValue, hasCached]
 */
export function useCachedState(key, initialValue) {
  const hasCached = cache.has(key);
  const [value, _setValue] = useState(() =>
    hasCached ? cache.get(key) : initialValue,
  );
  const keyRef = useRef(key);
  keyRef.current = key;

  const setValue = useCallback((newVal) => {
    _setValue((prev) => {
      const resolved = typeof newVal === "function" ? newVal(prev) : newVal;
      cache.set(keyRef.current, resolved);
      return resolved;
    });
  }, []);

  return [value, setValue, hasCached];
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key) {
  cache.delete(key);
}

/**
 * Clear entire cache.
 */
export function clearCache() {
  cache.clear();
}
