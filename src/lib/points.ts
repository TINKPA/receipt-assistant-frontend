/**
 * Loyalty-points display (#216 / FE#161).
 *
 * Backend #206 made a loyalty programme's unit a real currency: an award
 * stay writes balanced postings denominated in `HYATT_PT`, and a separate
 * valuation pass fills `amount_base_minor` from a rate the owner supplies.
 * This module owns the two things the frontend has to know about that.
 *
 * ## 1. Points are stored as WHOLE UNITS, cash as hundredths
 *
 * This is the part that bites, and it is invisible in the API response —
 * both arrive as an integer in a field called `amount_minor`:
 *
 *   cash    4200  ->  $42.00      (hundredths)
 *   points 42000  ->  42,000 pts  (whole points)
 *
 * `formatMoney` divides by 100 unconditionally, because for cash that is
 * always right. Handed a points leg it renders a real 42,000-point award
 * stay as "HYATT_PT 420.00" — understated by two orders of magnitude,
 * still shaped like a plausible number, and therefore believed. Measured
 * on the live Kissel Uptown Oakland folio (txn 5b47cfbe), which is in
 * production today.
 *
 * Points are also inherently integral. There is no such thing as 0.5 of a
 * Hyatt point, so a trailing `.00` is not merely noise — it implies a
 * precision the unit does not have.
 *
 * ## 2. The base-currency figure is an appraisal, not a fact
 *
 * `42,000 pts` is printed on the folio. The `$714.00` beside it exists
 * only because someone decided a Hyatt point is worth 1.7 cents, and the
 * live valuation is stamped `confirmed: false, source: "issue-206-example"`
 * — a placeholder from the issue that shipped the feature.
 *
 * So the two numbers carry different epistemic weight and must not be
 * typeset as equals. Every conversion is rendered with a leading `≈`, and
 * an unconfirmed one is additionally marked (see `PointsEstimate`). The
 * failure being designed against is #184's: a wrong number that looks
 * right survives for months precisely because nothing about it invites a
 * second look.
 *
 * ## Why this mirrors `src/points/codes.ts` instead of importing it
 *
 * The backend keeps cash and points provably disjoint by *shape* rather
 * than a lookup table, so the same guarantee holds here from the same
 * regex with no shared build step. The pattern is a contract: ISO 4217 is
 * three letters and cannot contain an underscore, so no present or future
 * cash code can ever match it.
 */

/** Points/miles unit, e.g. `HYATT_PT`, `AA_PT`, `BONVOY_PT`.
 *  Kept character-identical to the backend's `POINTS_CURRENCY_RE`. */
export const POINTS_CURRENCY_RE = /^[A-Z][A-Z0-9]{1,12}_PT$/;

export function isPointsCurrency(code: string | null | undefined): boolean {
  return typeof code === 'string' && POINTS_CURRENCY_RE.test(code);
}

/**
 * `HYATT_PT` → `Hyatt`, `AA_PT` → `AA`, `BONVOY_PT` → `Bonvoy`.
 *
 * Title-cases anything longer than an airline-style initialism, so a
 * two-letter programme keeps the casing its members actually use. Purely
 * cosmetic — nothing downstream parses this back.
 */
export function pointsProgrammeLabel(code: string): string {
  const stem = code.replace(/_PT$/, '');
  if (stem.length <= 3) return stem;
  return stem.charAt(0) + stem.slice(1).toLowerCase();
}

/**
 * Format a whole-unit points quantity: `42000` → `42,000 pts`.
 *
 * No currency symbol (there isn't one), no decimals (points are
 * integral), and no division (see the scale note above).
 *
 * @param units  Points, as stored in `amount_minor` / `line_total_minor`.
 * @param opts.signed    Render a negative as `−`; callers that show
 *                       expenses positive pass an absolute value.
 * @param opts.unit      Override the `pts` suffix — pass a programme
 *                       label where the programme isn't already obvious
 *                       from context.
 */
export function formatPoints(
  units: number,
  opts: { signed?: boolean; unit?: string } = {},
): string {
  const abs = Math.abs(Math.round(units)).toLocaleString('en-US');
  const sign = opts.signed && units < 0 ? '−' : '';
  return `${sign}${abs} ${opts.unit ?? 'pts'}`;
}

/** One programme's valuation, as recorded in `metadata.points.valuations`. */
export interface PointsValuation {
  currency: string;
  /** Base-currency minor units per one point (1.7 = 1.7¢/point). */
  minor_per_point: number;
  /** False until the owner has actually signed off on the rate. */
  confirmed: boolean;
  source: string;
  effective_from: string;
}

/** `metadata.points`, written by the backend's valuation pass (#206). */
export interface PointsMetadata {
  base_currency: string;
  valuations: PointsValuation[];
  /** Programmes with NO configured valuation — their base amount is 0
   *  and the transaction total silently omits them. */
  unvalued: string[];
  applied_at: string;
}

/**
 * Read `metadata.points` defensively.
 *
 * Returns null for every transaction that has no points leg, which is
 * almost all of them, so callers can render the disclosure
 * unconditionally and cash receipts stay pixel-identical to before.
 */
export function pointsFromMetadata(
  md: Record<string, unknown> | null | undefined,
): PointsMetadata | null {
  const raw = md?.points;
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const valuations = Array.isArray(rec.valuations)
    ? (rec.valuations as Record<string, unknown>[])
        .filter((v) => typeof v?.currency === 'string')
        .map(
          (v): PointsValuation => ({
            currency: v.currency as string,
            minor_per_point:
              typeof v.minor_per_point === 'number' ? v.minor_per_point : 0,
            // Absent `confirmed` is treated as UNconfirmed. An unset flag
            // means nobody said yes, and defaulting the other way would
            // hide exactly the case this disclosure exists for.
            confirmed: v.confirmed === true,
            source: typeof v.source === 'string' ? v.source : 'unknown',
            effective_from:
              typeof v.effective_from === 'string' ? v.effective_from : '',
          }),
        )
    : [];
  return {
    base_currency:
      typeof rec.base_currency === 'string' ? rec.base_currency : 'USD',
    valuations,
    unvalued: Array.isArray(rec.unvalued)
      ? (rec.unvalued as unknown[]).filter((c): c is string => typeof c === 'string')
      : [],
    applied_at: typeof rec.applied_at === 'string' ? rec.applied_at : '',
  };
}

/**
 * Does any valuation behind this transaction still lack sign-off?
 *
 * Drives the marked-estimate treatment. A programme with no valuation at
 * all (`unvalued`) counts too: its base contribution is 0, so the total
 * shown is not merely uncertain, it is short.
 */
export function hasUnconfirmedValuation(p: PointsMetadata | null): boolean {
  if (!p) return false;
  return p.unvalued.length > 0 || p.valuations.some((v) => !v.confirmed);
}

/** `1.7` → `1.7¢ / point`. The rate is the whole argument for the
 *  estimate, so it is shown rather than buried. */
export function formatPointsRate(minorPerPoint: number, baseCurrency: string): string {
  const unit = baseCurrency === 'USD' ? '¢' : ` ${baseCurrency} minor`;
  const n = Number(minorPerPoint.toFixed(4));
  return `${n}${unit} / point`;
}
