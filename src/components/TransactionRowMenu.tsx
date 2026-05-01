import React from 'react';
import { MoreVertical, Trash2, Undo2 } from 'lucide-react';
import { cn } from '../lib/utils';
import type { RawTransactionStatus } from '../types';

interface TransactionRowMenuProps {
  rawStatus: RawTransactionStatus | undefined;
  onHardDelete: () => void;
  onUnreconcile: () => void;
}

/** Per-row overflow popover. Hard-delete for non-reconciled rows;
 *  Unreconcile for reconciled. Click-outside dismissable, no popover lib. */
export default function TransactionRowMenu({
  rawStatus,
  onHardDelete,
  onUnreconcile,
}: TransactionRowMenuProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Don't render anything for synthetic / unknown rows.
  if (!rawStatus) return null;

  const canHardDelete =
    rawStatus === 'posted' ||
    rawStatus === 'voided' ||
    rawStatus === 'draft' ||
    rawStatus === 'error';
  const canUnreconcile = rawStatus === 'reconciled';

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-surface-container-highest transition-colors',
          open && 'bg-surface-container-highest text-white',
        )}
        aria-label="Row actions"
      >
        <MoreVertical size={18} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 min-w-[200px] rounded-xl bg-surface-container-high border border-outline-variant/20 shadow-2xl overflow-hidden">
          {canHardDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onHardDelete();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-error hover:bg-error/10 transition-colors text-left"
            >
              <Trash2 size={16} />
              <span className="font-bold">Hard delete</span>
            </button>
          )}
          {canUnreconcile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onUnreconcile();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-primary hover:bg-primary/10 transition-colors text-left"
            >
              <Undo2 size={16} />
              <span className="font-bold">Unreconcile</span>
            </button>
          )}
          {!canHardDelete && !canUnreconcile && (
            <div className="px-4 py-3 text-xs text-on-surface-variant">No actions</div>
          )}
        </div>
      )}
    </div>
  );
}
