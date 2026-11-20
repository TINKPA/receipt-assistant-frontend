import { useEffect, useState } from 'react';

/** The current time, refreshed every `everyMs`: for a render that depends
 *  on how long ago something happened, without reading the clock in render. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
