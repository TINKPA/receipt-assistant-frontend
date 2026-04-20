import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Receipt, CreditCard, Calendar, Tag, FileText, ChevronDown, ChevronUp, MapPin, Pencil, Ban, Trash2 } from 'lucide-react';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import {
  fetchReceiptDetail,
  documentContentUrl,
  extractProblemMessage,
  toReceiptView,
  voidTransaction,
  deleteTransaction,
  type ReceiptView,
  type BackendTransaction,
} from '../lib/api';
import { cn } from '../lib/utils';
import EditReceiptModal from './EditReceiptModal';
import ConfirmActionDialog from './ConfirmActionDialog';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111827' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#4b5563' }] },
];

interface ReceiptDetailProps {
  receiptId: string;
  onBack: () => void;
}

type Metadata = Record<string, unknown>;

function md<T = unknown>(meta: Metadata | undefined, key: string): T | undefined {
  if (!meta) return undefined;
  const v = meta[key];
  return v as T | undefined;
}

export default function ReceiptDetail({ receiptId, onBack }: ReceiptDetailProps) {
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'edit' | 'void' | 'delete' | null>(null);

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
    if (!receipt?.etag) throw new Error('No ETag — reload and retry.');
    const updated = await voidTransaction(receipt.id, reason, receipt.etag);
    // `voidTransaction` returns the mirror (reversing) txn, which has a
    // different id. Refetch the current receipt so we see its new
    // `voided` status and fresh ETag.
    void updated;
    setActiveDialog(null);
    loadReceipt();
  };

  const handleDeleteConfirm = async () => {
    if (!receipt?.etag) throw new Error('No ETag — reload and retry.');
    await deleteTransaction(receipt.id, receipt.etag);
    setActiveDialog(null);
    onBack();
  };

  useEffect(() => {
    loadReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  // Auto-poll if the transaction is still in draft/error state — which
  // means the extractor is either still running or needs human review.
  useEffect(() => {
    if (!receipt) return;
    if (receipt.status !== 'draft' && receipt.status !== 'error') return;
    const interval = setInterval(loadReceipt, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.status]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
        <span className="ml-3 text-on-surface-variant">Loading receipt...</span>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <button onClick={onBack} className="flex items-center gap-2 text-primary font-bold hover:opacity-80 transition-opacity">
          <ArrowLeft size={20} />
          Back
        </button>
        <div className="text-center py-20 text-error">{error || 'Receipt not found'}</div>
      </div>
    );
  }

  // Pull extractor-stashed fields out of metadata. These are not
  // first-class schema columns — the extraction agent writes them into
  // `transactions.metadata` / `documents.extraction_meta`.
  const meta = (receipt as unknown as { documents: Array<{ extraction_meta?: Metadata }> });
  const extraction = meta.documents[0]?.extraction_meta ?? undefined;
  const txMeta = (receipt.postings[0] as unknown as { metadata?: Metadata })?.metadata;
  const legacy: Metadata = {
    ...(txMeta ?? {}),
    ...(extraction ?? {}),
  };

  const isProcessing = receipt.status === 'draft';
  const tax = md<number>(legacy, 'tax');
  const tip = md<number>(legacy, 'tip');
  const latitude = md<number>(legacy, 'latitude');
  const longitude = md<number>(legacy, 'longitude');
  const address = md<string>(legacy, 'address');
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

  const canDelete = receipt.status === 'draft' || receipt.status === 'error';
  const canVoid = receipt.status === 'posted' || receipt.status === 'reconciled';
  const canEdit = receipt.status !== 'voided';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-2 text-primary font-bold hover:opacity-80 transition-opacity">
          <ArrowLeft size={20} />
          Back to transactions
        </button>

        {!isProcessing && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveDialog('edit')}
              disabled={!canEdit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-high text-white font-bold hover:bg-surface-container-highest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={canEdit ? 'Edit receipt' : 'Voided receipts cannot be edited'}
            >
              <Pencil size={16} />
              Edit
            </button>
            <button
              onClick={() => setActiveDialog('void')}
              disabled={!canVoid}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-high text-white font-bold hover:bg-surface-container-highest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={canVoid ? 'Void (reverse) this receipt' : 'Only posted receipts can be voided'}
            >
              <Ban size={16} />
              Void
            </button>
            <button
              onClick={() => setActiveDialog('delete')}
              disabled={!canDelete}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-error/10 text-error font-bold hover:bg-error/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={canDelete ? 'Delete this draft' : 'Only draft/error receipts can be deleted — use Void instead'}
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        )}
      </div>

      {isProcessing && (
        <div className="flex items-center gap-4 p-5 rounded-xl bg-tertiary/10 border border-tertiary/20">
          <Loader2 className="animate-spin text-tertiary" size={24} />
          <div>
            <p className="text-sm font-bold text-white">Still processing...</p>
            <p className="text-xs text-on-surface-variant mt-1">Claude is reading your receipt. This page will update automatically.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="glass-panel rounded-xl p-8 border border-outline-variant/10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-2">Merchant</p>
            <h2 className="text-3xl font-extrabold text-white font-headline">
              {isProcessing ? 'Processing...' : merchantLabel}
            </h2>
            <div className="flex items-center gap-6 mt-4 text-sm text-on-surface-variant">
              <span className="flex items-center gap-2">
                <Calendar size={16} />
                {isProcessing ? '--' : receipt.occurred_on}
              </span>
              {receipt.category && (
                <span className="flex items-center gap-2">
                  <Tag size={16} />
                  {receipt.category}
                </span>
              )}
              {receipt.paymentMethod && (
                <span className="flex items-center gap-2">
                  <CreditCard size={16} />
                  {receipt.paymentMethod.replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-2">Total</p>
            <p className="text-4xl font-extrabold text-white font-headline">
              {isProcessing ? '--' : `$${receipt.total.toFixed(2)}`}
            </p>
            <p className="text-sm text-on-surface-variant mt-1">{receipt.currency}</p>
          </div>
        </div>

        {!isProcessing && ((tax != null && tax > 0) || (tip != null && tip > 0)) && (
          <div className="flex gap-6 mt-6 pt-6 border-t border-outline-variant/10">
            {tax != null && tax > 0 && (
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest">Tax</p>
                <p className="text-lg font-bold text-white">${tax.toFixed(2)}</p>
              </div>
            )}
            {tip != null && tip > 0 && (
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest">Tip</p>
                <p className="text-lg font-bold text-white">${tip.toFixed(2)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {!isProcessing && items && items.length > 0 && (
        <div className="glass-panel rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-8 py-5 border-b border-outline-variant/10">
            <h3 className="font-headline font-bold text-white flex items-center gap-2">
              <Receipt size={18} />
              Line Items ({items.length})
            </h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-8 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest">Item</th>
                <th className="px-8 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest text-center">Qty</th>
                <th className="px-8 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest text-right">Unit Price</th>
                <th className="px-8 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {items.map((item, i) => (
                <tr key={i} className="hover:bg-surface-container-high/20 transition-colors">
                  <td className="px-8 py-4 text-sm font-medium text-white">{item.name}</td>
                  <td className="px-8 py-4 text-sm text-on-surface-variant text-center">{item.quantity ?? 1}</td>
                  <td className="px-8 py-4 text-sm text-on-surface-variant text-right">
                    {item.unit_price != null ? `$${item.unit_price.toFixed(2)}` : '--'}
                  </td>
                  <td className="px-8 py-4 text-sm font-bold text-white text-right">
                    {item.total_price != null ? `$${item.total_price.toFixed(2)}` : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isProcessing && receipt.documentId && (
        <div className="glass-panel rounded-xl p-6 border border-outline-variant/10">
          <h3 className="font-headline font-bold text-white mb-4">Receipt Image</h3>
          <img
            src={documentContentUrl(receipt.documentId)}
            alt="Receipt"
            className="max-w-full max-h-[500px] rounded-lg object-contain mx-auto"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {!isProcessing && latitude != null && longitude != null && GOOGLE_MAPS_API_KEY && (
        <div className="glass-panel rounded-xl p-6 border border-outline-variant/10">
          <h3 className="font-headline font-bold text-white mb-4 flex items-center gap-2">
            <MapPin size={18} />
            Location
          </h3>
          {address && (
            <p className="text-sm text-on-surface-variant mb-3">{address}</p>
          )}
          <div className="h-[300px] rounded-lg overflow-hidden">
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
              <Map
                defaultCenter={{ lat: latitude, lng: longitude }}
                defaultZoom={15}
                gestureHandling="cooperative"
                disableDefaultUI={false}
                styles={DARK_MAP_STYLES}
              >
                <Marker position={{ lat: latitude, lng: longitude }} />
              </Map>
            </APIProvider>
          </div>
        </div>
      )}

      {receipt.narration && (
        <div className="glass-panel rounded-xl p-6 border border-outline-variant/10">
          <h3 className="font-headline font-bold text-white mb-2">Notes</h3>
          <p className="text-sm text-on-surface-variant">{receipt.narration}</p>
        </div>
      )}

      {!isProcessing && rawText && (
        <div className="glass-panel rounded-xl border border-outline-variant/10 overflow-hidden">
          <button
            onClick={() => setShowRawText(!showRawText)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-container-high/30 transition-colors"
          >
            <span className="font-headline font-bold text-white flex items-center gap-2">
              <FileText size={18} />
              Raw Text
            </span>
            {showRawText ? <ChevronUp size={18} className="text-on-surface-variant" /> : <ChevronDown size={18} className="text-on-surface-variant" />}
          </button>
          {showRawText && (
            <div className="px-6 pb-6">
              <pre className="text-xs text-on-surface-variant whitespace-pre-wrap font-mono bg-surface-container-lowest rounded-lg p-4">
                {rawText}
              </pre>
            </div>
          )}
        </div>
      )}

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
            <p className="mt-2 text-xs text-on-surface-variant/70">
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

      <ConfirmActionDialog
        isOpen={activeDialog === 'delete'}
        onClose={() => setActiveDialog(null)}
        title="Delete this draft?"
        message={
          <p>
            This permanently removes the draft transaction and unlinks any attached documents.
            Only drafts and errored extractions can be deleted — posted receipts must be voided.
          </p>
        }
        confirmLabel="Delete forever"
        destructive
        onConfirm={handleDeleteConfirm}
      />

      {!isProcessing && confidence != null && (
        <div className="glass-panel rounded-xl p-6 border border-outline-variant/10">
          <h3 className="font-headline font-bold text-white mb-3">Extraction Quality</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <p className="text-xs text-on-surface-variant uppercase tracking-widest">Confidence</p>
              <p className={cn(
                "font-bold",
                confidence >= 0.7 ? 'text-primary' : 'text-error',
              )}>
                {(confidence * 100).toFixed(0)}%
              </p>
            </div>
            {warnings && warnings.length > 0 && (
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest">Warnings</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {warnings.map((w, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-error/10 text-error text-[10px] font-bold uppercase">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
