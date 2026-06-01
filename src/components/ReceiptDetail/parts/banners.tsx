import React from 'react';
import { cn } from '../../../lib/utils';

export function Banner({
  tone,
  children,
}: {
  tone: 'error';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[16px] px-4 py-3 text-sm',
        tone === 'error'
          ? 'border border-[var(--color-stamp)]/30 bg-[var(--color-stamp)]/5 text-[var(--color-stamp)]'
          : '',
      )}
    >
      {children}
    </div>
  );
}

/**
 * Feedback banner for re-extract. Mirrors the RefreshBanner pattern
 * in MerchantDetail — same aesthetic, separate copy to avoid pulling
 * a tiny presentational helper across the file boundary. If a third
 * surface needs the same widget, factor it out then.
 */
export function ReExtractBanner({
  tone,
  children,
  onDismiss,
}: {
  tone: 'success' | 'error';
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-[14px] px-4 py-3 text-sm',
        tone === 'success' &&
          'border border-[var(--color-terracotta)]/30 bg-[var(--color-terracotta)]/8 text-[var(--color-ink)]',
        tone === 'error' &&
          'border border-[var(--color-stamp)]/40 bg-[var(--color-stamp)]/5 text-[var(--color-stamp)]',
      )}
    >
      <p className="font-hand text-base leading-snug">{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[11px] uppercase tracking-[0.16em] opacity-60 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        dismiss
      </button>
    </div>
  );
}
