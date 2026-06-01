import { cn } from '../../../lib/utils';
import type { statusBadge } from '../../../lib/transactionStatus';

function sourceLabel(
  kind: string | null | undefined,
): { glyph: string; label: string } | null {
  if (kind === 'receipt_email') return { glyph: '✉︎', label: 'via email' };
  if (kind === 'receipt_pdf' || kind === 'statement_pdf')
    return { glyph: '⌗', label: 'via pdf' };
  return null;
}

export function StatusRow({
  badge,
  paymentMethod,
  source,
}: {
  badge: ReturnType<typeof statusBadge>;
  paymentMethod: string | null;
  source?: string | null;
}) {
  const src = sourceLabel(source);
  if (!badge && !paymentMethod && !src) return null;
  return (
    <div className="flex items-center justify-center gap-2 text-[12px] text-[var(--color-ink-muted)]">
      {src && (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
            'bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta-deep)]',
          )}
        >
          <span aria-hidden="true">{src.glyph}</span>
          {src.label}
        </span>
      )}
      {src && (badge || paymentMethod) && <span aria-hidden="true">·</span>}
      {badge && (
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
            badge.tone === 'red' && 'bg-[var(--color-stamp)]/10 text-[var(--color-stamp)]',
            badge.tone === 'green' && 'bg-[color:rgba(52,168,83,0.12)] text-[color:rgb(52,168,83)]',
            badge.tone === 'muted' && 'bg-[var(--color-paper-deep)] text-[var(--color-ink-muted)]',
          )}
        >
          {badge.label}
        </span>
      )}
      {badge && paymentMethod && <span aria-hidden="true">·</span>}
      {paymentMethod && (
        <span>
          {paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      )}
    </div>
  );
}
