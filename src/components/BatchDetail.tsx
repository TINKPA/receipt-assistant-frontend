import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Cog,
  FileText,
  Zap,
} from 'lucide-react';
import {
  getBatch,
  subscribeToBatch,
  extractProblemMessage,
  type BackendBatch,
  type BackendIngest,
  type IngestStatus,
} from '../lib/api';
import { cn } from '../lib/utils';

interface BatchDetailProps {
  batchId: string;
  onBack: () => void;
  onSelectTransaction: (txnId: string) => void;
}

const INGEST_STATUS_META: Record<
  IngestStatus,
  { label: string; badge: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  queued: { label: 'Queued', badge: 'bg-surface-container-highest text-on-surface-variant', icon: Clock },
  processing: { label: 'Processing', badge: 'bg-tertiary/10 text-tertiary', icon: Cog },
  done: { label: 'Done', badge: 'bg-primary/10 text-primary', icon: CheckCircle2 },
  error: { label: 'Error', badge: 'bg-error/10 text-error', icon: AlertCircle },
  unsupported: { label: 'Unsupported', badge: 'bg-error/10 text-error', icon: AlertCircle },
};

interface LiveEvent {
  id: number;
  at: Date;
  name: string;
  payload: unknown;
}

export default function BatchDetail({ batchId, onBack, onSelectTransaction }: BatchDetailProps) {
  const [batch, setBatch] = useState<BackendBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const eventCounter = useRef(0);

  const refetch = () => {
    getBatch(batchId)
      .then(setBatch)
      .catch((e) => setError(extractProblemMessage(e)));
  };

  useEffect(() => {
    setLoading(true);
    getBatch(batchId)
      .then(setBatch)
      .catch((e) => setError(extractProblemMessage(e)))
      .finally(() => setLoading(false));
  }, [batchId]);

  // Subscribe to the live stream. Each recognized event refetches the
  // batch so status/counts stay in sync; we also accumulate a running log.
  useEffect(() => {
    const controller = subscribeToBatch(
      batchId,
      (name, payload) => {
        eventCounter.current += 1;
        const evt: LiveEvent = {
          id: eventCounter.current,
          at: new Date(),
          name,
          payload,
        };
        setEvents((prev) => [evt, ...prev].slice(0, 50));
        // Any meaningful state change → refetch the batch snapshot.
        if (name !== 'hello' && name !== 'message') refetch();
      },
      () => {
        // EventSource errors are common when the server closes after a
        // terminal frame. Leave the snapshot as-is.
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-3">
        <Cog className="animate-spin text-primary" size={32} />
        <span className="text-on-surface-variant">Loading batch...</span>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <button onClick={onBack} className="flex items-center gap-2 text-primary font-bold hover:opacity-80 transition-opacity">
          <ArrowLeft size={20} />
          Back
        </button>
        <div className="text-center py-20 text-error">{error || 'Batch not found'}</div>
      </div>
    );
  }

  const { counts } = batch;
  const pct = counts.total > 0 ? Math.round(((counts.done + counts.error) / counts.total) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl">
      <button onClick={onBack} className="flex items-center gap-2 text-primary font-bold hover:opacity-80 transition-opacity">
        <ArrowLeft size={20} />
        Back to batches
      </button>

      <div className="glass-panel rounded-xl p-8 border border-outline-variant/10">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-2">Batch</p>
            <p className="text-2xl font-bold text-white font-headline font-mono">
              {batch.id.slice(0, 8)}…{batch.id.slice(-4)}
            </p>
            <p className="text-sm text-on-surface-variant mt-1">
              Uploaded {new Date(batch.created_at).toLocaleString()} ·{' '}
              {batch.auto_reconcile ? 'auto-reconcile on' : 'manual reconcile'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-2">Status</p>
            <p className="text-2xl font-bold text-white font-headline capitalize">
              {batch.status.replace('_', ' ')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-outline-variant/10">
          <StatCard label="Total" value={counts.total} />
          <StatCard label="Queued" value={counts.queued} tone="muted" />
          <StatCard label="Processing" value={counts.processing} tone="tertiary" />
          <StatCard label="Done" value={counts.done} tone="primary" />
          <StatCard label="Error" value={counts.error + counts.unsupported} tone="error" />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-all duration-500', counts.error > 0 ? 'bg-error' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm text-on-surface-variant font-mono">{pct}%</span>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-8 py-5 border-b border-outline-variant/10">
          <h3 className="font-headline font-bold text-white flex items-center gap-2">
            <FileText size={18} />
            Files ({batch.items.length})
          </h3>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-container-low/50">
              <th className="px-8 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest">File</th>
              <th className="px-8 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest">Classification</th>
              <th className="px-8 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest">Status</th>
              <th className="px-8 py-3 text-xs font-bold text-on-surface-variant uppercase tracking-widest">Produced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {batch.items.map((ing) => (
              <IngestRow key={ing.id} ingest={ing} onSelectTransaction={onSelectTransaction} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass-panel rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-8 py-5 border-b border-outline-variant/10 flex items-center justify-between">
          <h3 className="font-headline font-bold text-white flex items-center gap-2">
            <Zap size={18} />
            Live events
          </h3>
          <span className="text-xs text-on-surface-variant">
            {events.length === 0 ? 'Waiting for server...' : `${events.length} event(s)`}
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {events.length === 0 ? (
            <p className="px-8 py-6 text-sm text-on-surface-variant/60">
              Stream is open. Upload activity will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant/5">
              {events.map((e) => (
                <li key={e.id} className="px-8 py-3 flex items-center gap-4 text-xs font-mono">
                  <span className="text-on-surface-variant/60 w-20">
                    {e.at.toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span className="text-primary font-bold w-44 truncate">{e.name}</span>
                  <span className="text-on-surface-variant truncate flex-1">
                    {typeof e.payload === 'object' && e.payload !== null
                      ? JSON.stringify(e.payload)
                      : String(e.payload)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'muted' | 'primary' | 'tertiary' | 'error';
}) {
  const valueClass =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'tertiary'
        ? 'text-tertiary'
        : tone === 'error'
          ? 'text-error'
          : tone === 'muted'
            ? 'text-on-surface-variant'
            : 'text-white';
  return (
    <div>
      <p className="text-xs text-on-surface-variant uppercase tracking-widest">{label}</p>
      <p className={cn('text-2xl font-bold font-headline mt-1', valueClass)}>{value}</p>
    </div>
  );
}

function IngestRow({
  ingest,
  onSelectTransaction,
}: {
  ingest: BackendIngest;
  onSelectTransaction: (id: string) => void;
}) {
  const meta = INGEST_STATUS_META[ingest.status];
  const Icon = meta.icon;
  const txnIds = ingest.produced?.transaction_ids ?? [];
  return (
    <tr className="hover:bg-surface-container-high/30 transition-colors">
      <td className="px-8 py-4">
        <p className="text-sm font-medium text-white">{ingest.filename}</p>
        {ingest.mime_type && (
          <p className="text-[11px] text-on-surface-variant/70 mt-0.5 font-mono">{ingest.mime_type}</p>
        )}
        {ingest.error && (
          <p className="text-[11px] text-error mt-1 truncate max-w-md">{ingest.error}</p>
        )}
      </td>
      <td className="px-8 py-4 text-sm text-on-surface-variant">
        {ingest.classification ? ingest.classification.replace('_', ' ') : '—'}
      </td>
      <td className="px-8 py-4">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider',
            meta.badge,
          )}
        >
          <Icon size={12} />
          {meta.label}
        </span>
      </td>
      <td className="px-8 py-4 text-sm">
        {txnIds.length === 0 ? (
          <span className="text-on-surface-variant/60">—</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {txnIds.map((id) => (
              <button
                key={id}
                onClick={() => onSelectTransaction(id)}
                className="text-primary font-mono text-[11px] hover:underline"
              >
                {id.slice(0, 8)}…
              </button>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
