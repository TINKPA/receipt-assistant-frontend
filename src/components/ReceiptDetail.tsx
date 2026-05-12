import React, { useEffect, useState } from 'react';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import {
  classifyBackendCategory,
  fetchReceiptDetail,
  documentContentUrl,
  extractProblemMessage,
  getTransaction,
  toReceiptView,
  voidTransaction,
  restoreDocument,
  type ReceiptView,
  type BackendTransaction,
} from '../lib/api';
import { cn } from '../lib/utils';
import { CategoryIcon } from './CategoryIcon';
import EditReceiptModal from './EditReceiptModal';
import ConfirmActionDialog from './ConfirmActionDialog';
import DeleteReceiptDialog from './DeleteReceiptDialog';
import DeletedBadge from './DeletedBadge';
import { removeTombstone } from '../lib/tombstones';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

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
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'edit' | 'void' | 'delete' | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const loadReceipt = () => {
    fetchReceiptDetail(receiptId)
      .then(setReceipt)
      .catch((e: unknown) => setError(extractProblemMessage(e)))
      .finally(() => setLoading(false));
  };

  const handleUpdated = (txn: BackendTransaction, etag: string | null) => {
    setReceipt(toReceiptView(txn, etag));
  };

  const handleVoidConfirm = async (reason: string) => {
    if (!receipt?.etag) {
      const fresh = await getTransaction(receipt!.id);
      if (!fresh.etag) throw new Error('No ETag — reload and retry.');
      await voidTransaction(receipt!.id, reason, fresh.etag);
    } else {
      await voidTransaction(receipt.id, reason, receipt.etag);
    }
    setActiveDialog(null);
    loadReceipt();
    onAfterMutation?.();
  };

  const handleDeleted = () => {
    setActiveDialog(null);
    onAfterMutation?.();
    onBack();
  };

  const handleRestore = async () => {
    if (!receipt?.documentId) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await restoreDocument(receipt.documentId);
      removeTombstone(receipt.documentId);
      onAfterMutation?.();
      loadReceipt();
    } catch (err: unknown) {
      setRestoreError(extractProblemMessage(err));
    } finally {
      setRestoring(false);
    }
  };

  useEffect(() => {
    loadReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  // Auto-poll while extractor is still working.
  useEffect(() => {
    if (!receipt) return;
    if (receipt.status !== 'draft' && receipt.status !== 'error') return;
    const interval = setInterval(loadReceipt, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.status]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Crumbs onBack={onBack} />
        <div className="py-16 text-center">
          <p className="font-hand text-xl text-[var(--color-ink-muted)]">loading…</p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="space-y-4">
        <Crumbs onBack={onBack} />
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
  const latitude = receipt.place?.lat ?? null;
  const longitude = receipt.place?.lng ?? null;
  const address = receipt.place?.formatted_address ?? md<string>(legacy, 'address');
  const rawText = md<string>(legacy, 'raw_text');
  const items = md<Array<{ name: string; quantity?: number; unit_price?: number; total_price?: number }>>(legacy, 'items');
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

  return (
    <div className="space-y-6">
      <Crumbs onBack={onBack}>
        {isTombstoned && <DeletedBadge deletedAt={docDeletedAt} />}
      </Crumbs>

      <TitleBlock
        date={receipt.occurred_on}
        merchant={isProcessing ? 'Processing…' : merchantLabel}
        sub={isProcessing ? null : receiptSubLine(receipt, address)}
      />

      {isProcessing && (
        <ProcessingNote />
      )}

      {restoreError && (
        <Banner tone="error">Restore failed: {restoreError}</Banner>
      )}

      {!isProcessing && receipt.documentId && (
        <ReceiptImageCard documentId={receipt.documentId} />
      )}

      {receipt.narration && !isProcessing && (
        <NoteCard text={receipt.narration} />
      )}

      <FieldsGrid
        total={receipt.total}
        currency={receipt.currency}
        category={receipt.category}
        payment={receipt.paymentMethod ?? null}
        tax={tax}
        tip={tip}
        isProcessing={isProcessing}
      />

      {!isProcessing && items && items.length > 0 && (
        <LineItemsCard items={items} />
      )}

      {!isProcessing && latitude != null && longitude != null && GOOGLE_MAPS_API_KEY && (
        <LocationCard
          lat={latitude}
          lng={longitude}
          address={address}
          apiKey={GOOGLE_MAPS_API_KEY}
        />
      )}

      {!isProcessing && rawText && (
        <RawTextCard
          text={rawText}
          open={showRawText}
          onToggle={() => setShowRawText((s) => !s)}
        />
      )}

      {!isProcessing && confidence != null && (
        <ExtractionQualityCard
          confidence={confidence}
          warnings={warnings}
        />
      )}

      {/* Actions */}
      <Actions
        isProcessing={isProcessing}
        isTombstoned={isTombstoned}
        canEdit={canEdit}
        canVoid={canVoid}
        canDelete={canDelete}
        restoring={restoring}
        onEdit={() => setActiveDialog('edit')}
        onVoid={() => setActiveDialog('void')}
        onDelete={() => setActiveDialog('delete')}
        onRestore={handleRestore}
      />

      {/* Dialogs */}
      <EditReceiptModal
        isOpen={activeDialog === 'edit'}
        onClose={() => setActiveDialog(null)}
        receipt={receipt}
        onUpdated={handleUpdated}
        onStale={loadReceipt}
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
        onConfirm={handleVoidConfirm}
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

/* ── Pieces ───────────────────────────────────────────────────── */

function Crumbs({
  onBack,
  children,
}: {
  onBack: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-[11px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 hover:text-[var(--color-ink)] transition-colors"
      >
        <span className="font-display italic text-lg leading-none text-[var(--color-terracotta)]">
          ←
        </span>
        Ledger
      </button>
      {children}
    </div>
  );
}

function TitleBlock({
  date,
  merchant,
  sub,
}: {
  date: string;
  merchant: string;
  sub: string | null;
}) {
  return (
    <div>
      <p className="font-hand text-xl text-[var(--color-terracotta)] leading-none">
        {timeOfDayPhrase(date)}
      </p>
      <h1 className="mt-2 font-display italic font-medium text-3xl sm:text-4xl leading-[1.05] tracking-tight">
        {merchant}
      </h1>
      {sub && (
        <p className="mt-2 font-display italic text-[15px] text-[var(--color-ink-muted)]">
          {sub}
        </p>
      )}
    </div>
  );
}

function ReceiptImageCard({ documentId }: { documentId: string }) {
  return (
    <div
      className="rounded-[18px] border border-[var(--color-rule)] overflow-hidden p-4"
      style={{
        background:
          'linear-gradient(180deg, rgba(245, 230, 195, 0.4) 0%, rgba(201, 123, 92, 0.06) 100%), var(--color-surface)',
      }}
    >
      <img
        src={documentContentUrl(documentId)}
        alt="Receipt"
        className="block max-w-full max-h-[500px] object-contain mx-auto rounded-[10px]"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <p className="mt-3 font-display italic text-xs text-[var(--color-ink-muted)] text-center">
        fig. — original receipt, scanned.
      </p>
    </div>
  );
}

function NoteCard({ text }: { text: string }) {
  return (
    <div
      className="relative rounded-[16px] px-4 py-4 leading-snug"
      style={{ background: 'var(--color-butter)' }}
    >
      <span
        className={cn(
          'absolute -top-2 left-4 inline-block rounded-full px-2 py-[3px]',
          'bg-[var(--color-terracotta)] text-white',
          'text-[10px] font-medium tracking-[0.16em] uppercase',
        )}
      >
        your note
      </span>
      <p className="font-hand text-lg text-[var(--color-ink)]">{text}</p>
    </div>
  );
}

function FieldsGrid({
  total,
  currency,
  category,
  payment,
  tax,
  tip,
  isProcessing,
}: {
  total: number;
  currency: string;
  category: string | null;
  payment: string | null;
  tax: number | undefined;
  tip: number | undefined;
  isProcessing: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div
        className={cn(
          'col-span-2 rounded-[16px] px-5 py-4',
          'bg-[var(--color-terracotta)] text-white',
        )}
      >
        <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-white/70">
          Total
        </p>
        <p className="mt-1 font-display italic font-medium text-[2rem] leading-none tnum">
          {isProcessing ? '—' : `$${total.toFixed(2)}`}
        </p>
        <p className="mt-1 text-[11px] tracking-[0.12em] uppercase text-white/70">
          {currency}
        </p>
      </div>

      {tax != null && tax > 0 && (
        <SmallFieldCard label="Tax" value={`$${tax.toFixed(2)}`} numeric />
      )}
      {tip != null && tip > 0 && (
        <SmallFieldCard label="Tip" value={`$${tip.toFixed(2)}`} numeric />
      )}
      {payment && (
        <SmallFieldCard
          label="Payment"
          value={payment.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        />
      )}
      {category && <CategoryFieldCard rawCategory={category} />}
    </div>
  );
}

function CategoryFieldCard({ rawCategory }: { rawCategory: string }) {
  const { category, transactionType } = classifyBackendCategory(rawCategory);
  const label = category ?? (transactionType === 'spending' ? 'Uncategorized' : transactionType);
  return (
    <div className="rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        Category
      </p>
      <div className="mt-1 flex items-center gap-2">
        <CategoryIcon category={category} transactionType={transactionType} size={22} />
        <span className="text-[15px] font-medium capitalize">{label}</span>
      </div>
    </div>
  );
}

function SmallFieldCard({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-[15px] font-medium',
          numeric && 'font-display italic font-medium text-lg tnum',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function LineItemsCard({
  items,
}: {
  items: Array<{ name: string; quantity?: number; unit_price?: number; total_price?: number }>;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-rule)]">
        <h3 className="font-display italic font-medium text-lg leading-none">
          Items <span className="text-[var(--color-ink-muted)]">({items.length})</span>
        </h3>
      </div>
      <ul className="divide-y divide-[var(--color-rule-soft)]">
        {items.map((item, i) => (
          <li
            key={i}
            className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 px-5 py-3"
          >
            <span className="text-sm font-medium truncate">{item.name}</span>
            <span className="text-xs text-[var(--color-ink-muted)] tnum">
              {item.quantity ?? 1}×
            </span>
            <span className="font-display italic font-medium text-base tnum">
              {item.total_price != null ? `$${item.total_price.toFixed(2)}` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocationCard({
  lat,
  lng,
  address,
  apiKey,
}: {
  lat: number;
  lng: number;
  address: string | undefined;
  apiKey: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-rule)]">
        <h3 className="font-display italic font-medium text-lg leading-none">Where</h3>
        {address && (
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{address}</p>
        )}
      </div>
      <div className="h-[280px]">
        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={{ lat, lng }}
            defaultZoom={15}
            gestureHandling="cooperative"
            disableDefaultUI={false}
          >
            <Marker position={{ lat, lng }} />
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}

function RawTextCard({
  text,
  open,
  onToggle,
}: {
  text: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--color-paper-deep)]/30 transition-colors"
      >
        <span className="font-display italic font-medium text-lg leading-none">
          Raw OCR text
        </span>
        <span className="font-hand text-base text-[var(--color-terracotta)]">
          {open ? 'hide' : 'show ↓'}
        </span>
      </button>
      {open && (
        <pre className="px-5 pb-5 text-xs text-[var(--color-ink-muted)] whitespace-pre-wrap font-mono">
          {text}
        </pre>
      )}
    </div>
  );
}

function ExtractionQualityCard({
  confidence,
  warnings,
}: {
  confidence: number;
  warnings: string[] | undefined;
}) {
  const isHigh = confidence >= 0.7;
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-4">
      <h3 className="font-display italic font-medium text-lg leading-none mb-3">
        Extraction
      </h3>
      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
            Confidence
          </p>
          <p
            className={cn(
              'mt-1 font-display italic font-medium text-xl tnum',
              isHigh ? 'text-[var(--color-sage)]' : 'text-[var(--color-stamp)]',
            )}
          >
            {(confidence * 100).toFixed(0)}%
          </p>
        </div>
        {warnings && warnings.length > 0 && (
          <div>
            <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
              Warnings
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {warnings.map((w, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-[var(--color-stamp)]/10 text-[var(--color-stamp)] text-[10px] tracking-[0.08em] uppercase"
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessingNote() {
  return (
    <div
      className={cn(
        'rounded-[16px] px-4 py-4 flex items-start gap-3',
        'border border-[var(--color-rule)] bg-[var(--color-butter)]/40',
      )}
    >
      <span
        aria-hidden="true"
        className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-terracotta)] animate-pulse"
      />
      <div>
        <p className="font-display italic font-medium">Still reading your receipt</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Claude is extracting fields — this page will refresh on its own.
        </p>
      </div>
    </div>
  );
}

function Banner({
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

function Actions({
  isProcessing,
  isTombstoned,
  canEdit,
  canVoid,
  canDelete,
  restoring,
  onEdit,
  onVoid,
  onDelete,
  onRestore,
}: {
  isProcessing: boolean;
  isTombstoned: boolean;
  canEdit: boolean;
  canVoid: boolean;
  canDelete: boolean;
  restoring: boolean;
  onEdit: () => void;
  onVoid: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  if (isProcessing) return null;
  if (isTombstoned) {
    return (
      <div className="pt-2">
        <button
          type="button"
          onClick={onRestore}
          disabled={restoring}
          className={cn(
            'w-full rounded-[14px] py-3 text-sm font-medium tracking-[0.14em] uppercase',
            'bg-[var(--color-terracotta)] text-white hover:bg-[var(--color-terracotta-deep)]',
            'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {restoring ? 'Restoring…' : 'Restore receipt'}
        </button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete}
        className={cn(
          'rounded-[14px] py-3 text-sm font-medium tracking-[0.14em] uppercase',
          'border border-[var(--color-rule)] bg-[var(--color-surface)] text-[var(--color-ink)]',
          'hover:border-[var(--color-stamp)]/40 hover:text-[var(--color-stamp)]',
          'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        Delete…
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={!canEdit}
        className={cn(
          'rounded-[14px] py-3 text-sm font-medium tracking-[0.14em] uppercase',
          'bg-[var(--color-ink)] text-[var(--color-paper)] hover:bg-[#3a322c]',
          'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        Edit fields
      </button>
      {canVoid && (
        <button
          type="button"
          onClick={onVoid}
          className={cn(
            'col-span-2 rounded-[14px] py-2 text-xs font-medium tracking-[0.14em] uppercase',
            'text-[var(--color-ink-muted)] hover:text-[var(--color-stamp)] transition-colors',
          )}
        >
          Void (post a reversing entry) →
        </button>
      )}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function timeOfDayPhrase(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const dt = new Date(y, m - 1, d);
  const dow = dt.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
  return `${dow}, ${dt.toLocaleString('en-US', { month: 'long' }).toLowerCase()} ${d}`;
}

function receiptSubLine(receipt: ReceiptView, address: string | undefined): string | null {
  const bits: string[] = [];
  if (address) {
    // Keep just the first comma-separated chunk for the title — full address
    // shows up in the LocationCard.
    bits.push(address.split(',')[0].trim());
  }
  if (receipt.category) {
    bits.push(receipt.category);
  }
  return bits.length > 0 ? bits.join(' · ') : null;
}
