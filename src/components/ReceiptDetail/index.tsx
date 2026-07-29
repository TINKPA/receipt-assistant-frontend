import { useState } from 'react';
import { brandLink } from '../../lib/navLinks';
import {
  fetchReceiptDetail,
  extractProblemMessage,
  postReExtractDocument,
  toReceiptView,
  restoreDocument,
  type BackendTransaction,
  type ReExtractDocumentResult,
} from '../../lib/api';
import { statusBadge } from '../../lib/transactionStatus';
import { cn } from '../../lib/utils';
import type { Category } from '../../types';
import EditReceiptModal from '../EditReceiptModal';
import DeleteReceiptDialog from '../DeleteReceiptDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { removeTombstone } from '../../lib/tombstones';
import { SimpleBackBar } from './parts/SimpleBackBar';
import { TopBar } from './parts/TopBar';
import { AmountHero } from './parts/AmountHero';
import { PartyChips } from './parts/PartyChips';
import { StatusRow } from './parts/StatusRow';
import { OriginalReceiptCollapsible } from './parts/OriginalReceiptCollapsible';
import { NoteCard } from './parts/NoteCard';
import { LocationCard } from './parts/LocationCard';
import { FieldsGrid } from './parts/FieldsGrid';
import { LineItemsCard } from './parts/LineItemsCard';
import { ExtractionDetailsCollapsible } from './parts/ExtractionDetailsCollapsible';
import { ProcessingNote } from './parts/ProcessingNote';
import { Banner, ReExtractBanner } from './parts/banners';

interface ReceiptDetailProps {
  receiptId: string;
  onBack: () => void;
  /** Bumped when a delete completes so the parent's transaction list
   *  refetches. */
  onAfterMutation?: () => void;
}

type Metadata = Record<string, unknown>;

function md<T = unknown>(meta: Metadata | undefined, key: string): T | undefined {
  if (!meta) return undefined;
  const v = meta[key];
  return v as T | undefined;
}

/**
 * Read a money field out of the extractor's metadata blob, in MINOR
 * units.
 *
 * Every money value the extractor writes is an integer minor amount, but
 * the KEY it writes it under has drifted. All three spellings observed
 * across the live corpus are accepted, in this order:
 *
 *   1. `<field>_minor` — the canonical modern key.
 *   2. a bare `<field>` NUMBER — the legacy key, also minor units in
 *      spite of the plain name. Proof: transaction d81bdc3d has
 *      `subtotal` 17312 + `tax` 102 = 17414, exactly its posting's
 *      `amount_minor`, so that 102 is $1.02 and not $102.00.
 *   3. a bare `<field>` OBJECT carrying `<field>_minor` — the VAT block
 *      an invoice produces, e.g. `{ rate: '13%', tax_minor: 1120,
 *      gross_total_minor: …, net_subtotal_minor: … }`.
 *
 * Anything else — a string, null, NaN — returns undefined so the cell is
 * suppressed rather than rendering `NaN`.
 */
function moneyMinor(meta: Metadata, field: 'tax' | 'tip'): number | undefined {
  const direct = meta[`${field}_minor`];
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  const bare = meta[field];
  if (typeof bare === 'number' && Number.isFinite(bare)) return bare;
  if (bare && typeof bare === 'object') {
    const nested = (bare as Metadata)[`${field}_minor`];
    if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  }
  return undefined;
}

/**
 * Receipt detail — single-entry view in Variant B (Soft / Organic).
 * Follows docs/2026-05-10_Mockup_frontend_redesign-B-soft.html (fig.03).
 *
 * Functional surface is unchanged from the previous Material-3 version:
 *   - Auto-polls every 5s while status is draft/error.
 *   - Edit / Delete / Restore actions kept (the mockup shows just
 *     Edit + Delete; Restore is a conditional flow that shows up
 *     for posted/reconciled and tombstoned receipts respectively).
 *   - Renders line items, location map, raw OCR text, extraction quality
 *     when those metadata sub-objects exist.
 *
 * Data source: fetchReceiptDetail → real backend. No mocks, no fixtures.
 */
export default function ReceiptDetail({ receiptId, onBack, onAfterMutation }: ReceiptDetailProps) {
  const queryClient = useQueryClient();
  const [activeDialog, setActiveDialog] = useState<'edit' | 'delete' | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // Re-extract state machine. `idle` armed; `pending` (~30-60s — the
  // agent re-OCRs the image); `success` shows `changed_keys` toast;
  // `error` flashes the problem-detail message. Mirrors the
  // refresh-from-source pattern on MerchantDetail.
  const [reExtractState, setReExtractState] = useState<
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'success'; changedKeys: string[]; ocrChanged: boolean }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // The receipt detail (a Transaction + its documents) with its ETag embedded
  // in the view. Auto-polls every 5s while the extractor is still working
  // (status draft/error) via a conditional refetchInterval — replaces the old
  // setInterval effect.
  const {
    data: receipt = null,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: qk.receipt(receiptId),
    queryFn: () => fetchReceiptDetail(receiptId),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'draft' || s === 'error' ? 5000 : false;
    },
  });
  const error = queryError ? extractProblemMessage(queryError) : null;

  const invalidateReceipt = () =>
    queryClient.invalidateQueries({ queryKey: qk.receipt(receiptId) });

  // ETag write-back invariant: a PATCH response carries a FRESH ETag.
  // Write the updated view straight into the cache so a subsequent edit sends
  // the current If-Match. Invalidate-and-refetch would leave a stale-etag
  // window in which a fast second edit 412s — so this is setQueryData, not
  // invalidate. (EditReceiptModal calls this via onUpdated on PATCH success.)
  const handleUpdated = (txn: BackendTransaction, etag: string | null) => {
    queryClient.setQueryData(qk.receipt(receiptId), toReceiptView(txn, etag));
  };

  const handleDeleted = () => {
    setActiveDialog(null);
    // A delete soft-tombstones the document; refresh the tombstone list too.
    queryClient.invalidateQueries({ queryKey: qk.tombstones });
    onAfterMutation?.();
    onBack();
  };

  const restoreMut = useMutation({
    mutationFn: () => restoreDocument(receipt!.documentId!),
    onSuccess: () => {
      removeTombstone(receipt!.documentId!);
      invalidateReceipt();
      queryClient.invalidateQueries({ queryKey: qk.tombstones });
      onAfterMutation?.();
    },
    onError: (err: unknown) => setRestoreError(extractProblemMessage(err)),
  });
  const handleRestore = () => {
    if (!receipt?.documentId) return;
    setRestoreError(null);
    restoreMut.mutate();
  };

  const reExtractMut = useMutation({
    mutationFn: () => postReExtractDocument(receipt!.documentId!),
    onMutate: () => setReExtractState({ kind: 'pending' }),
    onSuccess: (result: ReExtractDocumentResult) => {
      // Refresh the transaction so the UI reflects any field changes the
      // agent committed (payee, occurred_on, occurred_at, etc).
      invalidateReceipt();
      onAfterMutation?.();
      setReExtractState({
        kind: 'success',
        changedKeys: result.changed_keys,
        ocrChanged: result.ocr_text_changed,
      });
      setTimeout(() => {
        setReExtractState((s) => (s.kind === 'success' ? { kind: 'idle' } : s));
      }, 6000);
    },
    onError: (err: unknown) =>
      setReExtractState({ kind: 'error', message: extractProblemMessage(err) }),
  });
  const handleReExtract = () => {
    if (!receipt?.documentId || reExtractMut.isPending) return;
    reExtractMut.mutate();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <SimpleBackBar onBack={onBack} />
        <div className="py-16 text-center">
          <p className="font-display italic text-lg text-[var(--color-ink-muted)]">loading…</p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="space-y-4">
        <SimpleBackBar onBack={onBack} />
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-stamp)]">
          {error || 'Receipt not found'}
        </div>
      </div>
    );
  }

  // Pull extractor-stashed fields out of metadata.
  //
  // The TRANSACTION's own metadata is the only source. Postings carry no
  // metadata (the backend's `mapPostingRow` emits id / transaction_id /
  // account_id / amount_minor / currency / fx_rate / amount_base_minor /
  // memo / created_at and nothing else) and document refs carry no
  // `extraction_meta`. This block used to read both of those through
  // `as unknown as` casts, which type-check but are always `undefined` at
  // runtime — so raw_text, items and quality silently never rendered.
  const legacy: Metadata = receipt.metadata;

  const isProcessing = receipt.status === 'draft';
  const taxMinor = moneyMinor(legacy, 'tax');
  const tipMinor = moneyMinor(legacy, 'tip');
  // Metadata money is what the paper printed, so it is denominated in the
  // RECEIPT's own currency — `originalCurrency` whenever the backend
  // converted the postings into the workspace base, and the base currency
  // otherwise (there is then nothing to disclose and the two are equal).
  // Passing `receipt.currency` unconditionally would label a ¥11.20 CNY
  // tax as "$11.20", which is the exact failure src/lib/money.ts exists
  // to prevent.
  const receiptCurrency = receipt.originalCurrency ?? receipt.currency;
  const rawText = md<string>(legacy, 'raw_text');
  const confidence = md<number>(
    (legacy.quality as Metadata | undefined) ?? {},
    'confidence_score',
  );
  const warnings = md<string[]>(
    (legacy.quality as Metadata | undefined) ?? {},
    'warnings',
  );
  const merchantLabel = receipt.payee ?? receipt.narration ?? 'Unknown';

  const primaryDoc = receipt.documents.find((d) => d.id === receipt.documentId) ?? receipt.documents[0];
  const docDeletedAt = primaryDoc?.deleted_at ?? null;
  const isTombstoned = docDeletedAt != null;

  const canDelete = !isTombstoned;
  const canEdit = !isTombstoned;

  const badge = statusBadge(receipt.status);
  const lowConfidence = confidence != null && confidence < 0.6;

  return (
    <div className="space-y-6">
      <TopBar
        onBack={onBack}
        isTombstoned={isTombstoned}
        deletedAt={docDeletedAt}
        isProcessing={isProcessing}
        canEdit={canEdit}
        canDelete={canDelete}
        restoring={restoreMut.isPending}
        onEdit={() => setActiveDialog('edit')}
        onDelete={() => setActiveDialog('delete')}
        onRestore={handleRestore}
      />

      <AmountHero
        amount={receipt.total}
        currency={receipt.currency}
        originalTotalMinor={receipt.originalTotalMinor}
        originalCurrency={receipt.originalCurrency}
        fxRate={receipt.fxRate}
        fxAsOfActual={receipt.fxAsOfActual}
        merchant={isProcessing ? 'Processing…' : merchantLabel}
        merchantBrandId={receipt.merchantBrandId}
        category={receipt.category as Category | null}
        occurredOn={receipt.occurred_on}
        isProcessing={isProcessing}
        tombstoned={isTombstoned}
        brandTo={
          // Merchant name in the hero → BrandPage (brand-level rollup
          // across all locations). The per-location detail is reachable
          // from the LocationCard below. Rendered as a real <a href> so
          // it opens in a new tab / split view on right-click.
          receipt.merchantBrandId ? brandLink(receipt.merchantBrandId) : undefined
        }
      />

      <StatusRow
        badge={badge}
        paymentMethod={receipt.paymentMethod ?? null}
        source={primaryDoc?.kind ?? null}
      />

      {/* Party graph dot-chips (board screens 02-03, v2 P4). */}
      {!isProcessing && <PartyChips transactionId={receipt.id} />}

      {isProcessing && <ProcessingNote />}

      {restoreError && (
        <Banner tone="error">Restore failed: {restoreError}</Banner>
      )}

      <FieldsGrid
        payment={receipt.paymentMethod ?? null}
        taxMinor={taxMinor}
        tipMinor={tipMinor}
        currency={receiptCurrency}
        isProcessing={isProcessing}
      />

      {!isProcessing && (
        <LocationCard
          place={receipt.place}
          merchantId={receipt.merchantId}
          payee={receipt.payee ?? null}
        />
      )}

      {/* Line items come from the relational `transaction_items` table
          (#81). There is deliberately NO `metadata.items` fallback here:
          the BACKEND already folds pre-#81 metadata rows into this same
          array — `mapTransactionRow` falls back to
          `itemsFromMetadataFallback(metadata)` and runs it through the
          same `mapTransactionItem` mapper
          (src/routes/transactions.service.ts). An empty array therefore
          means the transaction genuinely has no lines. */}
      {!isProcessing && receipt.items.length > 0 && (
        <LineItemsCard
          items={receipt.items}
          currency={receipt.currency}
          transactionId={receiptId}
        />
      )}

      {receipt.narration && !isProcessing && (
        <NoteCard text={receipt.narration} />
      )}

      {/* Related Email slot — populated once Gmail integration (#34) ships.
       *  Hidden when there are no matches (no skeleton, no placeholder). */}

      {!isProcessing && receipt.documentId && (
        <OriginalReceiptCollapsible
          documentId={receipt.documentId}
          kind={primaryDoc?.kind ?? null}
          mimeType={
            (primaryDoc as { mime_type?: string | null } | undefined)
              ?.mime_type ?? null
          }
          sourceMeta={
            (primaryDoc as { source_meta?: Record<string, unknown> | null } | undefined)
              ?.source_meta ?? null
          }
        />
      )}

      {/* Re-extract affordance. Only on active (non-deleted) receipts
          that have a linked document. Wall-time is ~30-60s for vision
          OCR, so we make the pending state visible. */}
      {!isProcessing &&
        receipt.documentId &&
        !isTombstoned && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleReExtract}
              disabled={reExtractState.kind === 'pending'}
              className={cn(
                'group inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]',
                'text-[var(--color-ink-muted)] hover:text-[var(--color-terracotta)]',
                'transition-colors disabled:opacity-50 disabled:cursor-wait',
              )}
              title="Re-run OCR with the current model and prompt"
            >
              <span className="font-display text-base leading-none text-[var(--color-accent)] group-hover:translate-x-px transition-transform">
                ↺
              </span>
              {reExtractState.kind === 'pending'
                ? 're-extracting… (~30-60s)'
                : 'Re-extract'}
            </button>

            {reExtractState.kind === 'success' && (
              <ReExtractBanner
                tone="success"
                onDismiss={() => setReExtractState({ kind: 'idle' })}
              >
                {reExtractState.changedKeys.length > 0
                  ? `Updated ${reExtractState.changedKeys.join(', ')}.`
                  : reExtractState.ocrChanged
                    ? 'OCR text refreshed; no transaction fields changed.'
                    : 'No changes — the agent produced the same output.'}
              </ReExtractBanner>
            )}
            {reExtractState.kind === 'error' && (
              <ReExtractBanner
                tone="error"
                onDismiss={() => setReExtractState({ kind: 'idle' })}
              >
                {reExtractState.message}
              </ReExtractBanner>
            )}
          </div>
        )}

      {!isProcessing && (rawText || confidence != null) && (
        <ExtractionDetailsCollapsible
          rawText={rawText}
          confidence={confidence}
          warnings={warnings}
          defaultOpen={lowConfidence}
        />
      )}

      {/* Dialogs */}
      <EditReceiptModal
        isOpen={activeDialog === 'edit'}
        onClose={() => setActiveDialog(null)}
        receipt={receipt}
        onUpdated={handleUpdated}
        onStale={invalidateReceipt}
      />

      <DeleteReceiptDialog
        isOpen={activeDialog === 'delete'}
        onClose={() => setActiveDialog(null)}
        documentId={receipt.documentId}
        transactionId={receipt.id}
        transactionEtag={receipt.etag}
        isReconciled={receipt.status === 'reconciled'}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
