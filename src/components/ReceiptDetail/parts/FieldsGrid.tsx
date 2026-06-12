import React from 'react';
import { cn } from '../../../lib/utils';

export function FieldsGrid({
  payment,
  tax,
  tip,
  isProcessing,
}: {
  payment: string | null;
  tax: number | undefined;
  tip: number | undefined;
  isProcessing: boolean;
}) {
  if (isProcessing) return null;
  const cells: React.ReactNode[] = [];
  if (tax != null && tax > 0) {
    cells.push(<SmallFieldCard key="tax" label="Tax" value={`$${tax.toFixed(2)}`} numeric />);
  }
  if (tip != null && tip > 0) {
    cells.push(<SmallFieldCard key="tip" label="Tip" value={`$${tip.toFixed(2)}`} numeric />);
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
