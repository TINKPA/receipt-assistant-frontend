/**
 * Render a transaction's time of day ("7:42 PM") from `occurred_at`.
 *
 * `occurred_at` is a timestamptz, so the API returns it normalised to UTC —
 * the receipt's own offset is gone. Formatting it in the browser's zone is
 * right for local spending but shifts a receipt from another zone (a trip)
 * by hours, and can even push it onto the wrong day. So the merchant's
 * geocoded `place.time_zone` is used when there is one, and the browser's
 * zone only as a fallback.
 *
 * Returns null when there is no time, or the value doesn't parse — the
 * caller then shows the date alone, never a made-up time.
 */
export function formatTimeOfDay(
  occurredAt: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  if (!occurredAt) return null;
  // Postgres-style "2026-11-06 22:36:37+00" isn't ISO 8601 enough for every
  // engine's Date parser (Safari rejects the space and the bare "+00").
  const iso = occurredAt.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  try {
    return dt.toLocaleTimeString('en-US', timeZone ? { ...opts, timeZone } : opts);
  } catch {
    // Unknown IANA zone name — fall back to the browser's zone.
    return dt.toLocaleTimeString('en-US', opts);
  }
}
