import type { RawTransactionStatus } from '../types';

export type StatusTone = 'muted' | 'green' | 'red';

export interface StatusBadge {
  label: string;
  tone: StatusTone;
  /** When true, callers should render the amount with a strikethrough. */
  strikethrough?: boolean;
  /** When true, callers should expose a retry affordance. */
  retryable?: boolean;
}

/**
 * Map a raw backend transaction status to a user-visible badge.
 *
 * Returns null for the default `posted` state — callers should render no
 * badge at all in that case (silent default, matching Apple Wallet's
 * "no badge on cleared transactions" pattern).
 */
export function statusBadge(raw: RawTransactionStatus): StatusBadge | null {
  switch (raw) {
    case 'draft':
      return { label: 'Processing', tone: 'muted' };
    case 'posted':
      return null;
    case 'reconciled':
      return { label: 'Reconciled', tone: 'green' };
    case 'voided':
      return { label: 'Voided', tone: 'red', strikethrough: true };
    case 'error':
      return { label: 'Extraction failed', tone: 'red', retryable: true };
  }
}

export function isProcessing(raw: RawTransactionStatus | undefined): boolean {
  return raw === 'draft';
}
