import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { listTransactionParties } from '../../../lib/api/parties';
import { brandLink } from '../../../lib/navLinks';
import { cn } from '../../../lib/utils';

/** Role → dot color, fixed semantics (DESIGN.md §9 role colors). */
const ROLE_DOT: Record<string, string> = {
  channel: 'bg-[var(--color-slate)]',
  seller: 'bg-[var(--color-amber)]',
  maker: 'bg-[var(--color-olive)]',
  acquirer: 'bg-[var(--color-ink-muted)]',
};

/**
 * The board's dot-chips (screens 02-03): every party the receipt
 * stated, channel/seller/maker/acquirer, deduped by (role, name).
 * Chips with a resolved brand link into the Brand page. Renders
 * nothing while the graph is empty — receipts ingested before prompt
 * v2.16 only carry the backfilled channel row.
 */
export function PartyChips({ transactionId }: { transactionId: string }) {
  const { data: parties = [] } = useQuery({
    queryKey: ['tx-parties', transactionId],
    queryFn: () => listTransactionParties(transactionId),
  });
  if (parties.length === 0) return null;

  const seen = new Set<string>();
  const chips = parties.filter((p) => {
    const k = `${p.role}:${p.display_name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
      {chips.map((p) => {
        const body = (
          <>
            <span
              aria-hidden="true"
              className={cn('h-[6px] w-[6px] rounded-full', ROLE_DOT[p.role] ?? ROLE_DOT.acquirer)}
            />
            <span className="font-mono text-[9px] tracking-[0.04em] text-[var(--color-ink-soft)]">
              {p.display_name}
            </span>
            <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
              {p.role}
            </span>
          </>
        );
        const cls =
          'inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-2.5 py-1';
        return p.brand_id ? (
          <Link key={p.id} {...brandLink(p.brand_id)} className={cn(cls, 'hover:border-[var(--color-rule)]')}>
            {body}
          </Link>
        ) : (
          <span key={p.id} className={cls}>
            {body}
          </span>
        );
      })}
    </div>
  );
}
