import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'motion/react';
import { listTransactionParties, type TransactionParty } from '../../../lib/api/parties';
import { brandLink } from '../../../lib/navLinks';
import { cn } from '../../../lib/utils';

/** Role → dot color, fixed semantics (DESIGN.md §9 role colors). */
const ROLE_DOT: Record<string, string> = {
  channel: 'bg-[var(--color-slate)]',
  seller: 'bg-[var(--color-amber)]',
  maker: 'bg-[var(--color-olive)]',
  acquirer: 'bg-[var(--color-ink-muted)]',
};

const ROLE_ORDER = ['channel', 'seller', 'maker', 'acquirer'];

/**
 * The board's dot-chips (screens 02-03): every party the receipt
 * stated, channel/seller/maker/acquirer, deduped by (role, name).
 * Chips with a resolved brand link into the Brand page. Below the chips,
 * the board screen 03.8 handle ("N rows · M parties") opens a bottom
 * sheet with the full graph — including the per-line-item maker/seller
 * rows the deduped chips collapse. Renders nothing while the graph is
 * empty — receipts ingested before prompt v2.16 only carry the
 * backfilled channel row.
 */
export function PartyChips({ transactionId }: { transactionId: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);
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

  // Only surface the handle when the full graph holds more than the
  // chips already show — otherwise the chips ARE the whole story.
  const hasMore = parties.length > chips.length;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {chips.map((p) => (
          <PartyChip key={p.id} party={p} />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="group mx-auto mt-2 flex flex-col items-center gap-1"
        >
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-[var(--color-rule)] transition-colors group-hover:bg-[var(--color-ink-muted)]" />
          <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)] transition-colors group-hover:text-[var(--color-ink-muted)]">
            {parties.length} rows · {chips.length} parties · view graph
          </span>
        </button>
      )}

      <PartiesSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        transactionId={transactionId}
        parties={parties}
        distinctCount={chips.length}
      />
    </>
  );
}

function PartyChip({ party: p }: { party: TransactionParty }) {
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
    <Link {...brandLink(p.brand_id)} className={cn(cls, 'hover:border-[var(--color-rule)]')}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/**
 * Board screen 03.8 — the full transaction_parties graph as a bottom
 * sheet (mirrors the DeleteReceiptDialog sheet shell). Splits the graph
 * into transaction-level parties and the per-line-item rows so the user
 * sees why "N rows" exceeds "M parties".
 */
function PartiesSheet({
  open,
  onClose,
  transactionId,
  parties,
  distinctCount,
}: {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  parties: TransactionParty[];
  distinctCount: number;
}) {
  const txLevel = parties.filter((p) => p.transaction_item_id == null);
  const itemLevel = parties.filter((p) => p.transaction_item_id != null);
  const byRole = (rows: TransactionParty[]) =>
    [...rows].sort(
      (a, b) =>
        (ROLE_ORDER.indexOf(a.role) + 1 || 99) - (ROLE_ORDER.indexOf(b.role) + 1 || 99) ||
        a.display_name.localeCompare(b.display_name),
    );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[color:rgba(26,22,18,0.38)]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
            className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[20px] bg-[var(--color-paper)] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_40px_rgba(26,22,18,0.28)]"
          >
            <div aria-hidden="true" className="mx-auto mb-2 mt-2.5 h-1 w-9 rounded-full bg-[var(--color-rule)]" />
            <div className="flex items-baseline justify-between px-5 pb-3">
              <div>
                <h2 className="font-display text-[19px] font-medium tracking-tight">
                  The party graph
                </h2>
                <p className="mt-0.5 font-mono text-[9px] tracking-[0.04em] text-[var(--color-ink-muted)]">
                  {parties.length} rows · {distinctCount} parties · tx_{transactionId.slice(0, 8)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
              >
                done
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <PartyGroup title="Transaction" rows={byRole(txLevel)} />
              {itemLevel.length > 0 && (
                <PartyGroup title="Per line item" rows={byRole(itemLevel)} />
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function PartyGroup({ title, rows }: { title: string; rows: TransactionParty[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
        {title} · {rows.length}
      </h3>
      <div className="rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-3.5">
        {rows.map((p, i) => {
          const inner = (
            <>
              <span
                aria-hidden="true"
                className={cn('h-2 w-2 flex-shrink-0 rounded-full', ROLE_DOT[p.role] ?? ROLE_DOT.acquirer)}
              />
              <span className="min-w-0 flex-1 truncate font-display text-[13px] font-medium text-[var(--color-ink)]">
                {p.display_name}
              </span>
              <span className="flex-shrink-0 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                {p.role}
              </span>
              {p.brand_id && (
                <span aria-hidden="true" className="flex-shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                  ›
                </span>
              )}
            </>
          );
          const cls = cn(
            'flex items-center gap-2.5 py-2.5',
            i > 0 && 'border-t border-[var(--color-rule-soft)]',
          );
          return p.brand_id ? (
            <Link key={p.id} {...brandLink(p.brand_id)} className={cn(cls, 'transition-opacity hover:opacity-70')}>
              {inner}
            </Link>
          ) : (
            <div key={p.id} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
