import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Receipt, CreditCard, Calendar, DollarSign, Tag, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchReceiptDetail, type ReceiptDetail as ReceiptDetailType } from '../lib/api';
import { cn } from '../lib/utils';

interface ReceiptDetailProps {
  receiptId: string;
  onBack: () => void;
}

export default function ReceiptDetail({ receiptId, onBack }: ReceiptDetailProps) {
  const [receipt, setReceipt] = useState<ReceiptDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);

  const loadReceipt = () => {
    fetchReceiptDetail(receiptId)
      .then(setReceipt)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReceipt();
  }, [receiptId]);

  // Auto-poll if still processing
  useEffect(() => {
    if (receipt?.status !== 'processing') return;
    const interval = setInterval(loadReceipt, 5000);
    return () => clearInterval(interval);
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

  const isProcessing = receipt.status === 'processing';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-4xl">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-primary font-bold hover:opacity-80 transition-opacity">
        <ArrowLeft size={20} />
        Back to transactions
      </button>

      {/* Processing banner */}
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
              {isProcessing ? 'Processing...' : receipt.merchant}
            </h2>
            <div className="flex items-center gap-6 mt-4 text-sm text-on-surface-variant">
              <span className="flex items-center gap-2">
                <Calendar size={16} />
                {isProcessing ? '--' : receipt.date}
              </span>
              {receipt.category && (
                <span className="flex items-center gap-2">
                  <Tag size={16} />
                  {receipt.category}
                </span>
              )}
              {receipt.payment_method && (
                <span className="flex items-center gap-2">
                  <CreditCard size={16} />
                  {receipt.payment_method.replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-2">Total</p>
            <p className="text-4xl font-extrabold text-white font-headline">
              {isProcessing ? '--' : `$${receipt.total.toFixed(2)}`}
            </p>
            <p className="text-sm text-on-surface-variant mt-1">{receipt.currency ?? 'USD'}</p>
          </div>
        </div>

        {/* Tax / Tip breakdown */}
        {!isProcessing && (receipt.tax || receipt.tip) && (
          <div className="flex gap-6 mt-6 pt-6 border-t border-outline-variant/10">
            {receipt.tax != null && receipt.tax > 0 && (
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest">Tax</p>
                <p className="text-lg font-bold text-white">${receipt.tax.toFixed(2)}</p>
              </div>
            )}
            {receipt.tip != null && receipt.tip > 0 && (
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest">Tip</p>
                <p className="text-lg font-bold text-white">${receipt.tip.toFixed(2)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Line Items */}
      {!isProcessing && receipt.items && receipt.items.length > 0 && (
        <div className="glass-panel rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-8 py-5 border-b border-outline-variant/10">
            <h3 className="font-headline font-bold text-white flex items-center gap-2">
              <Receipt size={18} />
              Line Items ({receipt.items.length})
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
              {receipt.items.map((item, i) => (
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

      {/* Receipt Image */}
      {!isProcessing && (
        <div className="glass-panel rounded-xl p-6 border border-outline-variant/10">
          <h3 className="font-headline font-bold text-white mb-4">Receipt Image</h3>
          <img
            src={`/api/receipt/${receiptId}/image`}
            alt="Receipt"
            className="max-w-full max-h-[500px] rounded-lg object-contain mx-auto"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Notes */}
      {receipt.notes && (
        <div className="glass-panel rounded-xl p-6 border border-outline-variant/10">
          <h3 className="font-headline font-bold text-white mb-2">Notes</h3>
          <p className="text-sm text-on-surface-variant">{receipt.notes}</p>
        </div>
      )}

      {/* Raw Text (collapsible) */}
      {!isProcessing && receipt.raw_text && (
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
                {receipt.raw_text}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Extraction metadata */}
      {!isProcessing && receipt.extraction_meta && (
        <div className="glass-panel rounded-xl p-6 border border-outline-variant/10">
          <h3 className="font-headline font-bold text-white mb-3">Extraction Quality</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {receipt.extraction_meta.quality?.confidence_score != null && (
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest">Confidence</p>
                <p className={cn(
                  "font-bold",
                  receipt.extraction_meta.quality.confidence_score >= 0.7 ? 'text-primary' : 'text-error'
                )}>
                  {(receipt.extraction_meta.quality.confidence_score * 100).toFixed(0)}%
                </p>
              </div>
            )}
            {receipt.extraction_meta.quality?.warnings && receipt.extraction_meta.quality.warnings.length > 0 && (
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest">Warnings</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {receipt.extraction_meta.quality.warnings.map((w, i) => (
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
