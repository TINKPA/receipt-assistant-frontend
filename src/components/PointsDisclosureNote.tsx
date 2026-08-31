/**
 * The points disclosure that rides under a report total (#216 / FE#161).
 *
 * ## Why a total needs a footnote at all
 *
 * Every `/v1/reports/*` payload carries a `points` block, because a
 * base-currency total that silently mixes cash with a *valuation* of
 * Hyatt points is not a number anyone can act on. August 2026 is the
 * live example: `$4,527.59` of spend, of which `$714.00` — **16%** — is
 * points converted at 1.7¢, a rate stamped `confirmed: false` and
 * sourced from the example in the issue that shipped the feature.
 *
 * Nothing on the screen said so. The total was not wrong, exactly; it
 * was *unqualified*, which is the same failure as #184 one level up: a
 * number that looks like a measurement when it is partly an estimate.
 *
 * ## Two opposite polarities, one component
 *
 * `included_in_totals` flips the whole meaning, so it drives the copy
 * rather than the caller choosing:
 *
 *   true   (summary / trends / cashflow) — points ARE in the total, so
 *          the risk is that it is soft. Disclose how much.
 *   false  (net worth) — points accounts are EXCLUDED, so the risk is
 *          that the number looks short. Say why it is deliberate.
 *
 * ## Silence is the default
 *
 * A workspace with no points in scope renders nothing at all, so every
 * existing screen stays pixel-identical. A disclosure that shows up on
 * reports it does not apply to is noise, and noise is how the one that
 * matters gets skipped.
 */
import { cn } from '../lib/utils';
import { formatMoney } from '../lib/money';
import { formatPoints, pointsProgrammeLabel } from '../lib/points';
import type { BackendPointsDisclosure } from '../lib/api';

export function PointsDisclosureNote({
  points,
  currency,
  className,
}: {
  points: BackendPointsDisclosure | null | undefined;
  /** The report's base currency — the unit `base_minor` is expressed in. */
  currency: string;
  className?: string;
}) {
  if (!points) return null;

  const { base_minor, unconfirmed_base_minor, unvalued_transaction_count } = points;
  const programmes = points.programmes ?? [];
  const nothingInScope =
    base_minor === 0 && unvalued_transaction_count === 0 && programmes.length === 0;
  if (nothingInScope) return null;

  // Amber is earned by one of two things, and both mean the total cannot
  // be taken at face value: part of it rests on an unratified rate, or
  // part of it is missing outright. Everything else stays muted — a
  // confirmed valuation is just arithmetic and deserves no alarm.
  const soft = unconfirmed_base_minor !== 0 || unvalued_transaction_count > 0;
  const excluded = !points.included_in_totals;

  return (
    <div
      className={cn(
        'mt-4 border-l-2 pl-3 py-1',
        soft ? 'border-[var(--color-amber)]' : 'border-[var(--color-rule)]',
        className,
      )}
    >
      <p
        className={cn(
          'font-mono text-[9px] tracking-[0.16em] uppercase',
          soft ? 'text-[var(--color-amber)]' : 'text-[var(--color-ink-muted)]',
        )}
      >
        {excluded ? 'points excluded' : 'includes points'}
      </p>

      <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
        {excluded ? (
          <>
            Points accounts are left out of these balances on purpose. Only
            redemptions are recorded — earning never reaches the ledger — so a
            points balance here would be a tally of points{' '}
            <em className="not-italic font-medium">spent</em>, not held.
          </>
        ) : (
          <>
            {formatMoney(Math.abs(base_minor), currency)} of this total is loyalty
            points converted to {currency}
            {unconfirmed_base_minor !== 0 && (
              <>
                , and{' '}
                <span className="font-medium text-[var(--color-amber)]">
                  {formatMoney(Math.abs(unconfirmed_base_minor), currency)}
                </span>{' '}
                of that rests on a valuation nobody has confirmed
              </>
            )}
            .
          </>
        )}
      </p>

      {/* An unvalued programme does not make the total soft, it makes it
          SHORT — those transactions contributed zero. Different sentence,
          because "uncertain" and "missing" call for different actions. */}
      {unvalued_transaction_count > 0 && (
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-amber)]">
          {unvalued_transaction_count}{' '}
          {unvalued_transaction_count === 1 ? 'transaction' : 'transactions'} counted
          as zero — no valuation is configured for{' '}
          {unvalued_transaction_count === 1 ? 'its' : 'their'} programme.
        </p>
      )}

      {programmes.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
          {programmes.map((p) => (
            <li
              key={p.currency}
              className="font-mono text-[11px] tnum text-[var(--color-ink-muted)]"
            >
              <span className="text-[var(--color-ink-soft)]">
                {pointsProgrammeLabel(p.currency)}
              </span>{' '}
              {formatPoints(p.points_minor)}
              {p.valuation_exists ? (
                <>
                  {' '}
                  ≈ {formatMoney(Math.abs(p.base_minor), currency)}
                  {!p.valuation_confirmed && (
                    <span className="text-[var(--color-amber)]"> ·&nbsp;unconfirmed</span>
                  )}
                </>
              ) : (
                <span className="text-[var(--color-amber)]"> · not valued</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
