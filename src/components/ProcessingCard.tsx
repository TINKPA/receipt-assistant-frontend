import React from 'react';
import { Loader2, CheckCircle, Layers, XCircle, X, ChevronRight, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import type { ProcessingItem } from './useProcessingJobs';

interface ProcessingCardListProps {
  items: ProcessingItem[];
  onDismiss: (batchId: string) => void;
  /** Tap a terminal card to jump to its transaction. For a dedup hit
   *  this is the pre-existing row the upload matched. */
  onSelectTransaction?: (transactionId: string) => void;
}

/**
 * Inline upload status — design "方案 4".
 *
 * Instead of a fixed corner toast (which on a phone covered the ledger
 * and collided with the floating dock), the in-flight receipt shows as a
 * card in-context at the top of the list. While processing it reads as a
 * skeleton placeholder; on completion the real row arrives via list
 * refresh and this card auto-dismisses.
 *
 * Render it directly above a ledger list. Renders nothing when idle.
 */
export default function ProcessingCardList({
  items,
  onDismiss,
  onSelectTransaction,
}: ProcessingCardListProps) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <ProcessingCard
            key={item.batchId}
            item={item}
            onDismiss={() => onDismiss(item.batchId)}
            onSelectTransaction={onSelectTransaction}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ProcessingCard({
  item,
  onDismiss,
  onSelectTransaction,
}: {
  item: ProcessingItem;
  onDismiss: () => void;
  onSelectTransaction?: (transactionId: string) => void;
}) {
  // Terminal cards that resolved to a transaction are tappable — jump to
  // it. For dedup this is the pre-existing row the upload matched, so the
  // user can confirm it's already tracked rather than wondering where
  // their upload went.
  const tappable =
    (item.status === 'done' || item.status === 'duplicate') &&
    !!item.transactionId &&
    !!onSelectTransaction;

  const goToTransaction = () => {
    if (tappable && item.transactionId) {
      onSelectTransaction!(item.transactionId);
      onDismiss();
    }
  };

  const processing = item.status === 'processing';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onClick={tappable ? goToTransaction : undefined}
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onKeyDown={
        tappable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goToTransaction();
              }
            }
          : undefined
      }
      className={cn(
        'relative flex items-center gap-3 rounded-[18px] px-4 py-3.5',
        'border bg-[var(--color-terracotta-soft)] border-[var(--color-terracotta)]/35',
        processing && 'border-dashed',
        item.status === 'error' &&
          'bg-[var(--color-stamp)]/5 border-[var(--color-stamp)]/30',
        item.status === 'duplicate' &&
          'bg-[var(--color-surface)] border-[var(--color-rule)]',
        tappable && 'cursor-pointer hover:border-[var(--color-terracotta)]/55 transition-colors',
      )}
    >
      <StatusGlyph status={item.status} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[15px] font-semibold leading-snug',
            item.status === 'error'
              ? 'text-[var(--color-stamp)]'
              : item.status === 'done'
                ? 'text-[var(--color-sage)]'
                : item.status === 'duplicate'
                  ? 'text-[var(--color-ink)]'
                  : 'text-[var(--color-terracotta-deep)]',
          )}
        >
          {processing && 'Reading your receipt…'}
          {item.status === 'done' && 'Receipt added'}
          {item.status === 'duplicate' && 'Already in your ledger'}
          {item.status === 'error' && "Couldn't read this receipt"}
        </p>

        {processing && (
          // Skeleton lines stand in for the merchant + amount we're about
          // to extract, so the card previews the shape of the real row.
          <div className="mt-2 space-y-1.5" aria-hidden="true">
            <div className="h-2 w-2/5 rounded-full bg-[var(--color-terracotta)]/25 animate-pulse" />
            <div className="h-2 w-3/5 rounded-full bg-[var(--color-terracotta)]/15 animate-pulse" />
          </div>
        )}
        {item.status === 'duplicate' && (
          <p className="mt-0.5 text-xs text-[var(--color-ink-muted)] truncate">
            This receipt was added before
          </p>
        )}
        {item.status === 'error' && item.error && (
          <p className="mt-0.5 text-xs text-[var(--color-stamp)]/80 truncate">{item.error}</p>
        )}
        {item.status !== 'error' && (
          <p className="mt-1 text-[11px] text-[var(--color-ink-muted)] truncate">{item.filename}</p>
        )}
      </div>

      {tappable ? (
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-[var(--color-terracotta-deep)]">
          View
          <ChevronRight size={14} />
        </span>
      ) : (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="shrink-0 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </motion.div>
  );
}

/** Leading 44px glyph, sized to align with ledger row icons. */
function StatusGlyph({ status }: { status: ProcessingItem['status'] }) {
  if (status === 'processing') {
    return (
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--color-surface)] border border-[var(--color-terracotta)]/20">
        <Receipt size={18} className="text-[var(--color-terracotta)]/40" />
        <Loader2
          size={44}
          className="absolute inset-0 m-auto animate-spin text-[var(--color-terracotta)]/30"
          strokeWidth={1.25}
        />
      </div>
    );
  }
  const map = {
    done: { Icon: CheckCircle, cls: 'text-[var(--color-sage)]' },
    duplicate: { Icon: Layers, cls: 'text-[var(--color-terracotta)]' },
    error: { Icon: XCircle, cls: 'text-[var(--color-stamp)]' },
  } as const;
  const { Icon, cls } = map[status];
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--color-surface)] border border-[var(--color-rule)]">
      <Icon size={20} className={cls} />
    </div>
  );
}
