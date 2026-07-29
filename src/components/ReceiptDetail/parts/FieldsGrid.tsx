import React from 'react';
import { cn } from '../../../lib/utils';
import { formatMoney } from '../../../lib/money';

/**
 * Tax / tip / payment-method cells under the hero.
 *
 * Takes money as MINOR units plus a currency, not pre-formatted strings,
 * for two reasons: the ledger stores every amount as an integer minor
 * value so minor units are what the caller already has (no lossy
 * round-trip through a float), and the `> 0` suppression rule below —
 * "a zero or absent tax renders no cell at all" — has to look at the
 * number. Handing in a formatted string would push that rule out to
 * every caller. Formatting itself is `formatMoney`'s job; this component
 * never writes a currency symbol of its own (see src/lib/money.ts for
 * why a hard-coded `$` is a bug).
 */
export function FieldsGrid({
  payment,
  taxMinor,
  tipMinor,
  currency,
  isProcessing,
}: {
  payment: string | null;
  /** Tax as printed on the receipt, in minor units (cents). Undefined
   *  when the receipt carried no tax line. */
  taxMinor: number | undefined;
  /** Tip as printed on the receipt, in minor units. */
  tipMinor: number | undefined;
  /** ISO-4217 code the two amounts above are denominated in. */
  currency: string;
  isProcessing: boolean;
}) {
  if (isProcessing) return null;
  const cells: React.ReactNode[] = [];
  if (taxMinor != null && taxMinor > 0) {
    cells.push(
      <SmallFieldCard key="tax" label="Tax" value={formatMoney(taxMinor, currency)} numeric />,
    );
  }
  if (tipMinor != null && tipMinor > 0) {
    cells.push(
      <SmallFieldCard key="tip" label="Tip" value={formatMoney(tipMinor, currency)} numeric />,
    );
  }
  if (payment) {
    cells.push(
      <SmallFieldCard
        key="payment"
        label="Payment"
        value={payment.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
      />,
    );
  }
  if (cells.length === 0) return null;
  return <div className="grid grid-cols-2 gap-3">{cells}</div>;
}

function SmallFieldCard({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-[15px] font-medium',
          numeric && 'font-mono font-semibold text-[15px] tracking-tight tnum',
        )}
      >
        {value}
      </p>
    </div>
  );
}
