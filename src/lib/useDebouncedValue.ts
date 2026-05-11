import { useEffect, useState } from 'react';

/** Returns a copy of `value` that only updates after it has been
 *  stable for `delayMs` milliseconds. Useful for debouncing text
 *  inputs that drive network requests (search box, free-text filters). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
