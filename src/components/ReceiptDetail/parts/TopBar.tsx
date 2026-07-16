import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../../../lib/utils';
import DeletedBadge from '../../DeletedBadge';

export function TopBar({
  onBack,
  isTombstoned,
  deletedAt,
  isProcessing,
  canEdit,
  canDelete,
  restoring,
  onEdit,
  onDelete,
  onRestore,
}: {
  onBack: () => void;
  isTombstoned: boolean;
  deletedAt: string | null;
  isProcessing: boolean;
  canEdit: boolean;
  canDelete: boolean;
  restoring: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <div className="flex items-center justify-between text-[11px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 hover:text-[var(--color-ink)] transition-colors"
      >
        <span className="font-display text-lg leading-none text-[var(--color-accent)]">←</span>
        Back
      </button>
      <div className="flex items-center gap-3">
        {isTombstoned && <DeletedBadge deletedAt={deletedAt} />}
        {isTombstoned ? (
          <button
            type="button"
            onClick={onRestore}
            disabled={restoring}
            className={cn(
              'rounded-full px-3 py-1.5 text-[11px] font-medium tracking-[0.14em] uppercase',
              'bg-[var(--color-terracotta)] text-white hover:bg-[var(--color-terracotta-deep)]',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {restoring ? 'Restoring…' : 'Restore'}
          </button>
        ) : (
          !isProcessing && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((s) => !s)}
                aria-label="Receipt actions"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  'border border-[var(--color-rule)] bg-[var(--color-surface)]',
                  'hover:border-[var(--color-ink)]/30 transition-colors',
                )}
              >
                <MoreHorizontal size={16} className="text-[var(--color-ink)]" />
              </button>
              {menuOpen && (
                <div
                  className={cn(
                    'absolute right-0 z-30 mt-2 min-w-[180px] p-1',
                    'rounded-[14px] bg-[var(--color-surface)] border border-[var(--color-rule)]',
                    'shadow-[0_12px_32px_-10px_rgba(45,37,32,0.18)]',
                  )}
                >
                  <MenuItem
                    label="Edit fields"
                    disabled={!canEdit}
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                  />
                  <MenuItem
                    label="Delete…"
                    disabled={!canDelete}
                    destructive
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  />
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full text-left px-3 py-2 rounded-[10px] text-sm transition-colors normal-case tracking-normal',
        destructive
          ? 'text-[var(--color-stamp)] hover:bg-[var(--color-stamp)]/8'
          : 'text-[var(--color-ink)] hover:bg-[var(--color-paper-deep)]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {label}
    </button>
  );
}
