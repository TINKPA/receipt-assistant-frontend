import { useState } from 'react';
import { brandLink } from '../../lib/navLinks';
import {
  fetchReceiptDetail,
  extractProblemMessage,
  getTransaction,
  postReExtractDocument,
  toReceiptView,
  voidTransaction,
  restoreDocument,
  type BackendTransaction,
  type BackendTransactionItem,
  type ReExtractDocumentResult,
} from '../../lib/api';
import { statusBadge } from '../../lib/transactionStatus';
import { cn } from '../../lib/utils';
import type { Category } from '../../types';
import EditReceiptModal from '../EditReceiptModal';
import ConfirmActionDialog from '../ConfirmActionDialog';
import DeleteReceiptDialog from '../DeleteReceiptDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { removeTombstone } from '../../lib/tombstones';
import { SimpleBackBar } from './parts/SimpleBackBar';
import { TopBar } from './parts/TopBar';
import { AmountHero } from './parts/AmountHero';
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
 * Receipt detail — single-entry view in Variant B (Soft / Organic).
 * Follows docs/2026-05-10_Mockup_frontend_redesign-B-soft.html (fig.03).
 *
 * Functional surface is unchanged from the previous Material-3 version:
 *   - Auto-polls every 5s while status is draft/error.
 *   - Edit / Void / Delete / Restore actions kept (the mockup shows just
 *     Edit + Delete; Void and Restore are conditional flows that show up
 *     for posted/reconciled and tombstoned receipts respectively).
 *   - Renders line items, location map, raw OCR text, extraction quality
 *     when those metadata sub-objects exist.
 *
 * Data source: fetchReceiptDetail → real backend. No mocks, no fixtures.
 */
export default function ReceiptDetail({ receiptId, onBack, onAfterMutation }: ReceiptDetailProps) {
  const queryClient = useQueryClient();
  const [activeDialog, setActiveDialog] = useState<'edit' | 'void' | 'delete' | null>(null);
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

  // ETag write-back invariant: a PATCH/void response carries a FRESH ETag.
  // Write the updated view straight into the cache so a subsequent edit sends
  // the current If-Match. Invalidate-and-refetch would leave a stale-etag
  // window in which a fast second edit 412s — so this is setQueryData, not
  // invalidate. (EditReceiptModal calls this via onUpdated on PATCH success.)
  const handleUpdated = (txn: BackendTransaction, etag: string | null) => {
    queryClient.setQueryData(qk.receipt(receiptId), toReceiptView(txn, etag));
  };

  const voidMut = useMutation({
    mutationFn: async (reason: string) => {
      // Defensive: if the cached view lacks an etag, re-fetch a fresh one.
      let etag = receipt?.etag ?? null;
      if (!etag) {
        const fresh = await getTransaction(receipt!.id);
        if (!fresh.etag) throw new Error('No ETag — reload and retry.');
        etag = fresh.etag;
      }
      return voidTransaction(receipt!.id, reason, etag);
    },
    onSuccess: () => {
      setActiveDialog(null);
      invalidateReceipt();
      onAfterMutation?.();
    },
  });

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
  const meta = (receipt as unknown as { documents: Array<{ extraction_meta?: Metadata }> });
  const extraction = meta.documents[0]?.extraction_meta ?? undefined;
  const txMeta = (receipt.postings[0] as unknown as { metadata?: Metadata })?.metadata;
  const legacy: Metadata = { ...(txMeta ?? {}), ...(extraction ?? {}) };

  const isProcessing = receipt.status === 'draft';
  const tax = md<number>(legacy, 'tax');
  const tip = md<number>(legacy, 'tip');
  const rawText = md<string>(legacy, 'raw_text');
  // #81: prefer transaction_items table (relational, with item_class /
  // unit_price_minor / line_total_minor); fall back to legacy
  // metadata.items JSON for transactions ingested before the lift.
  const legacyItems = md<Array<{ name: string; quantity?: number; unit_price?: number; total_price?: number }>>(legacy, 'items');
  const items: BackendTransactionItem[] = receipt.items.length > 0
    ? receipt.items
    : (legacyItems ?? []).map((i, idx) => ({
        line_no: idx + 1,
        raw_name: i.name,
        normalized_name: null,
        quantity: i.quantity ?? 1,
        unit: null,
        unit_price_minor: i.unit_price != null ? Math.round(i.unit_price * 100) : null,
        line_total_minor: i.total_price != null ? Math.round(i.total_price * 100) : 0,
        currency: receipt.currency,
        item_class: 'other',
        confidence: 'low',
        line_type: 'product',
        product_id: null,
        tax_minor: null,
        tip_share_minor: null,
        discount_share_minor: null,
        effective_total_minor: i.total_price != null ? Math.round(i.total_price * 100) : 0,
      } satisfies BackendTransactionItem));
  const confidence = md<number>(
    (legacy.quality as Metadata | undefined) ?? {},
    'confidence_score',
  );
  const warnings = md<string[]>(
    (legacy.quality as Metadata | undefined) ?? {},
    'warnings',
  );
  const merchantLabel = receipt.payee ?? receipt.narration ?? 'Unknown';

  const canDelete = receipt.status !== 'voided';
  const canVoid = receipt.status === 'posted' || receipt.status === 'reconciled';
  const canEdit = receipt.status !== 'voided';

  const primaryDoc = receipt.documents.find((d) => d.id === receipt.documentId) ?? receipt.documents[0];
  const docDeletedAt = (primaryDoc as { deleted_at?: string | null } | undefined)?.deleted_at ?? null;
  const isTombstoned = docDeletedAt != null;

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
        canVoid={canVoid}
        canDelete={canDelete}
        restoring={restoreMut.isPending}
        onEdit={() => setActiveDialog('edit')}
        onVoid={() => setActiveDialog('void')}
        onDelete={() => setActiveDialog('delete')}
        onRestore={handleRestore}
      />

      <AmountHero
        amount={receipt.total}
        currency={receipt.currency}
        merchant={isProcessing ? 'Processing…' : merchantLabel}
        merchantBrandId={receipt.merchantBrandId}
        category={receipt.category as Category | null}
        occurredOn={receipt.occurred_on}
        isProcessing={isProcessing}
        voided={receipt.status === 'voided'}
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

      {isProcessing && <ProcessingNote />}

      {restoreError && (
        <Banner tone="error">Restore failed: {restoreError}</Banner>
      )}

      <FieldsGrid
        payment={receipt.paymentMethod ?? null}
        tax={tax}
        tip={tip}
        isProcessing={isProcessing}
      />

      {!isProcessing && (
        <LocationCard
          place={receipt.place}
          merchantId={receipt.merchantId}
          payee={receipt.payee ?? null}
        />
      )}

      {!isProcessing && items.length > 0 && (
        <LineItemsCard items={items} currency={receipt.currency} />
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
          sourceMeta={
            (primaryDoc as { source_meta?: Record<string, unknown> | null } | undefined)
              ?.source_meta ?? null
          }
        />
      )}

      {/* Re-extract affordance. Only on active (non-voided) receipts
          that have a linked document. Wall-time is ~30-60s for vision
          OCR, so we make the pending state visible. */}
      {!isProcessing &&
        receipt.documentId &&
        receipt.status !== 'voided' && (
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
                {reExtractState.changedKeys.length === 0 && !reExtractState.ocrChanged
                  ? 'No changes — the agent produced the same output.'
                  : reExtractState.changedKeys.length === 0
                    ? 'OCR text refreshed; no transaction fields changed.'
                    : `Updated ${reExtractState.changedKeys.join(', ')}.`}
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

      <ConfirmActionDialog
        isOpen={activeDialog === 'void'}
        onClose={() => setActiveDialog(null)}
        title="Void this receipt?"
        message={
          <>
            <p>
              Voiding creates a reversing entry in the ledger — the original transaction stays,
              but its balance cancels out. Use this for posted receipts you can't simply delete.
            </p>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              This action can be reversed only by creating a new offsetting transaction.
            </p>
          </>
        }
        confirmLabel="Void receipt"
        destructive
        requireReason
        reasonPlaceholder="Why are you voiding this? (optional)"
        onConfirm={(reason) => voidMut.mutateAsync(reason).then(() => undefined)}
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
