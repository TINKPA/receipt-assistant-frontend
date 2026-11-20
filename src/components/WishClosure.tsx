import { Link } from '@tanstack/react-router';
import type { WishItem } from '../lib/api/things';
import type { WishClosure } from '../lib/wishPlaces';
import { cn } from '../lib/utils';

/**
 * How a converted wish was closed, in one line: "Went Nov 20, 2026 ·
 * Tsujita LA · $18.90" when a receipt closed it, "Marked visited Nov 20,
 * 2026" when the person did. A thing reads "Bought" / "Marked bought".
 */
export function WishClosureText({
  closure,
  kind,
}: {
  closure: WishClosure;
  kind: WishItem['kind'];
}) {
  if (closure.by === 'receipt') {
    return (
      <>
        {kind === 'place' ? 'Went' : 'Bought'} {closure.date}
        {closure.payee && <> · {closure.payee}</>}
        {' · '}
        <span className="font-mono text-[0.92em] text-[var(--color-ink)]">{closure.amount}</span>
      </>
    );
  }
  const marked = kind === 'place' ? 'Marked visited' : 'Marked bought';
  return <>{closure.date ? `${marked} ${closure.date}` : marked}</>;
}

/** The closure as a card; a receipt's opens the receipt. */
export function WishClosureCard({
  closure,
  kind,
  className,
}: {
  closure: WishClosure;
  kind: WishItem['kind'];
  className?: string;
}) {
  const box = cn('text-[13px] leading-snug text-[var(--color-ink-soft)]', className);
  if (closure.by !== 'receipt') {
    return (
      <p className={box}>
        <WishClosureText closure={closure} kind={kind} />
      </p>
    );
  }
  return (
    <Link
      to="/receipt/$receiptId"
      params={{ receiptId: closure.transactionId }}
      className={cn(box, 'flex items-baseline justify-between gap-3 transition-colors hover:border-[var(--color-rule)]')}
    >
      <span className="min-w-0">
        <WishClosureText closure={closure} kind={kind} />
      </span>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-accent)]">
        receipt →
      </span>
    </Link>
  );
}
