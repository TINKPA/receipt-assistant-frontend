/**
 * Money formatting (#184).
 *
 * Before this module every amount in the app was rendered as
 * `` `$${n.toFixed(2)}` `` — a hard-coded dollar sign. That was fine while
 * every receipt was USD and actively wrong once one wasn't: a ¥13,948.80
 * receipt rendered as "$13,948.80", which reads as a real number rather
 * than a unit error, so nobody catches it.
 *
 * The rule the app follows now:
 *
 *   - **Arithmetic is always in the workspace base currency.** Totals,
 *     group subtotals, category rollups and trends all sum
 *     `postings.amount_base_minor`, which the backend converts at the
 *     receipt's own date. Adding a CNY amount to a USD amount is never
 *     correct and is now not expressible.
 *   - **Display shows the base amount first and the original alongside
 *     it.** The primary number is the one that adds up to the total you
 *     see above it; the original is what is printed on the receipt in
 *     your hand. Both matter, so both are shown, and only one of them is
 *     ever summed.
 *
 * #216 extended the same shape to loyalty points, which are a currency
 * here too (backend #206) — with one trap that FX does not have: points
 * are stored as WHOLE UNITS, so dividing them like cash is wrong.
 * `formatMoney` detects a points code and delegates; the scale rule and
 * the reasoning live in `src/lib/points.ts`.
 *
 * ## Minor units are per currency
 *
 * An amount arrives as an integer count of ITS OWN currency's minor
 * unit: cents for USD, fen for CNY, whole yen for JPY (the yen has no
 * subunit), fils for KWD (a dinar is 1000 of them). `currencyExponent`
 * below says how many decimals that is, and `formatMoney` divides by it.
 * Until the backend respected exponents this module divided everything
 * by 100, so a ¥5,000 receipt printed as ¥50.00.
 */
import { formatPoints, isPointsCurrency } from './points';

/** Symbols for the currencies this ledger actually sees. Anything else
 *  renders as an ISO code prefix (`SEK 1,234.00`), which is unambiguous
 *  and needs no maintenance. */
const SYMBOLS: Record<string, string> = {
  USD: '$',
  CNY: '¥',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  HKD: 'HK$',
  TWD: 'NT$',
  KRW: '₩',
  CAD: 'CA$',
  AUD: 'A$',
};

/** ISO 4217 minor-unit exponent of every currency not listed below. */
const DEFAULT_CURRENCY_EXPONENT = 2;

/**
 * ISO 4217 minor-unit exponents that are not 2.
 *
 * A copy of `ISO_4217_EXPONENTS` in the backend's `src/ledger/money.ts`,
 * which is what decides the unit of every `amount_minor` the API serves;
 * the API does not send the exponent, so the table has to live on both
 * sides. Keep the two identical. `Intl.NumberFormat` is NOT a substitute:
 * its digits come from CLDR, which follows cash practice and disagrees
 * with ISO 4217 on a number of codes (forint and rupiah have two
 * decimals by ISO and none by CLDR; the Iraqi dinar three and none), and
 * the backend stores by ISO.
 */
const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  // No subunit in use.
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  // Thousandths.
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  // Ten-thousandths (units of account).
  CLF: 4,
  UYW: 4,
};

/**
 * How many decimal places separate a currency's minor unit from its
 * whole unit: 2 for USD, 0 for JPY, 3 for KWD. A points programme has no
 * subunit, so its exponent is 0.
 */
export function currencyExponent(currency: string): number {
  if (isPointsCurrency(currency)) return 0;
  return CURRENCY_EXPONENTS[currency] ?? DEFAULT_CURRENCY_EXPONENT;
}

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? '';
}

/**
 * Format a minor-unit integer in `currency`.
 *
 * @param minor     Amount in `currency`'s OWN minor unit (cents, fen,
 *                  whole yen, fils). Sign is preserved only if `signed`
 *                  is set — callers that render expenses as positive
 *                  numbers pass the absolute value themselves.
 * @param currency  ISO-4217 code, or a points code (see the delegation
 *                  note below).
 * @param opts.maximumFractionDigits  Override for compact displays that
 *                  want a whole-unit figure (headline totals). It can
 *                  only shorten: a yen amount never grows decimals.
 */
export function formatMoney(
  minor: number,
  currency: string,
  opts: { maximumFractionDigits?: number; signed?: boolean } = {},
): string {
  // #216 — a points leg reaching here is NOT an error, so this delegates
  // rather than throwing (the backend's `getRate()` throws on a points
  // code, but it can afford to: a blank screen is worse than a wrong
  // symbol, and every one of this function's call sites renders user-
  // visible text).
  //
  // It has to be caught HERE rather than at each call site because points
  // and cash are indistinguishable at the point of call — both are an
  // integer in a field named `amount_minor`, and only the currency code
  // says which scale it is on. Twelve call sites each had to remember;
  // now none of them do. Do not "simplify" this away: without it a
  // 42,000-point stay renders as `HYATT_PT 420.00`.
  if (isPointsCurrency(currency)) {
    return formatPoints(minor, { signed: opts.signed });
  }
  const exponent = currencyExponent(currency);
  const digits = Math.min(opts.maximumFractionDigits ?? exponent, exponent);
  const value = minor / 10 ** exponent;
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sym = currencySymbol(currency);
  const body = sym ? `${sym}${abs}` : `${currency} ${abs}`;
  const sign = opts.signed && value < 0 ? '−' : '';
  return `${sign}${body}`;
}

/**
 * The "as printed on the receipt" line shown under a converted amount,
 * e.g. `¥13,948.80 · 0.14658 @ Apr 17`.
 *
 * `fx.rate` is the exchange rate AS PUBLISHED — one whole unit of the
 * receipt's currency in whole units of the base currency, from the
 * transaction's `metadata.fx.rates[].rate`. Never pass
 * `postings.fx_rate`: that is the multiplier between MINOR units, and
 * equals the published rate only when both currencies have the same
 * number of decimals (yen to dollars is published at 0.0065 and stored
 * as 0.65, cents per yen).
 *
 * Returns null when there is nothing to disclose — same currency as the
 * base, or no conversion recorded — so a caller can render it
 * unconditionally and USD receipts stay visually identical to before.
 */
export function formatOriginalAmount(
  originalMinor: number | null,
  originalCurrency: string | null,
  fx?: { rate: number; asOfActual: string } | null,
): string | null {
  if (originalMinor === null || originalCurrency === null) return null;
  const amount = formatMoney(Math.abs(originalMinor), originalCurrency);
  if (!fx) return amount;
  return `${amount} · ${fx.rate} @ ${shortDate(fx.asOfActual)}`;
}

/** `2026-04-17` → `Apr 17`. Parsed as parts, never `new Date(iso)`, which
 *  would shift the day backwards in negative-offset timezones. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  return new Date(y, m - 1, d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
