import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  getBatch,
  subscribeToBatch,
  extractProblemMessage,
  type BackendIngest,
  type IngestStatus,
} from '../lib/api';
import { cn } from '../lib/utils';
import { qk } from '../lib/queryKeys';
import { receiptLink } from '../lib/navLinks';

interface BatchDetailProps {
  batchId: string;
  onBack: () => void;
}

/** Ingest status → editorial dot-badge (board screen 28). */
const INGEST_META: Record<IngestStatus, { label: string; tone: string }> = {
  queued: { label: 'queued', tone: 'queued' },
  processing: { label: 'extracting', tone: 'proc' },
  done: { label: 'done', tone: 'done' },
  dedup: { label: 'dedup', tone: 'dedup' },
  near_dup: { label: 'near-dup', tone: 'neardup' },
  error: { label: 'error', tone: 'err' },
  unsupported: { label: 'unsupported', tone: 'err' },
};

const TONE: Record<string, { box: string; dot: string; pulse?: boolean }> = {
  queued: { box: 'bg-[var(--color-paper-deep)] text-[var(--color-ink-muted)]', dot: 'bg-[var(--color-ink-faint)]' },
  proc: { box: 'bg-[color:rgba(188,134,36,0.16)] text-[var(--color-amber)]', dot: 'bg-[var(--color-amber)]', pulse: true },
  done: { box: 'bg-[color:rgba(92,107,61,0.15)] text-[var(--color-olive)]', dot: 'bg-[var(--color-olive)]' },
  dedup: { box: 'bg-[color:rgba(63,85,99,0.13)] text-[var(--color-slate)]', dot: 'bg-[var(--color-slate)]' },
  neardup: { box: 'bg-[color:rgba(188,134,36,0.16)] text-[var(--color-amber)]', dot: 'bg-[var(--color-amber)]' },
  err: { box: 'bg-[color:rgba(181,52,26,0.13)] text-[var(--color-accent)]', dot: 'bg-[var(--color-accent)]' },
};

interface LiveEvent {
  id: number;
  at: Date;
  name: string;
  payload: unknown;
}

function fmtElapsed(batch: { created_at: string; completed_at?: string | null }): string {
  const start = new Date(batch.created_at).getTime();
  const end = batch.completed_at ? new Date(batch.completed_at).getTime() : Date.now();
  const s = Math.max(0, Math.round((end - start) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${Math.round(m / 60)}h`;
}

export default function BatchDetail({ batchId, onBack }: BatchDetailProps) {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const eventCounter = useRef(0);

  const { data: batch = null, isLoading: loading, error: queryError } = useQuery({
    queryKey: qk.batch(batchId),
    queryFn: () => getBatch(batchId),
  });
  const error = queryError ? extractProblemMessage(queryError) : null;

  useEffect(() => {
    const controller = subscribeToBatch(
      batchId,
      (name, payload) => {
        setConnected(true);
        eventCounter.current += 1;
        const evt: LiveEvent = { id: eventCounter.current, at: new Date(), name, payload };
        setEvents((prev) => [evt, ...prev].slice(0, 50));
        if (name !== 'hello' && name !== 'message')
          queryClient.invalidateQueries({ queryKey: qk.batch(batchId) });
      },
      () => setConnected(false),
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  if (loading) {
    return (
      <p className="py-16 text-center font-display italic text-[var(--color-ink-muted)]">loading…</p>
    );
  }
  if (error || !batch) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          ← Back to batches
        </button>
        <p className="py-16 text-center text-[var(--color-stamp)]">{error || 'Batch not found'}</p>
      </div>
    );
  }

  const { counts } = batch;
  const done = counts.done + counts.dedup + counts.near_dup;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          ← Back to batches
        </button>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          {batch.id.slice(0, 8)} · {batch.auto_reconcile ? 'auto-reconcile' : 'manual'}
        </span>
      </div>

      {/* b-meta */}
      <div className="grid grid-cols-3 divide-x divide-[var(--color-rule-soft)] rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] py-3">
        <Meta label="Files" value={String(counts.total)} />
        <Meta label="Done" value={String(done)} />
        <Meta label="Elapsed" value={fmtElapsed(batch)} />
      </div>

      {/* Ingests */}
      <section>
        <h2 className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          Ingests
        </h2>
        <div className="overflow-hidden rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)]">
          {batch.items.map((ing, idx) => (
            <IngestRow key={ing.id} ingest={ing} first={idx === 0} />
          ))}
        </div>
      </section>

      {/* LIVE TRACE */}
      <section className="rounded-[13px] bg-[var(--color-ink)] px-4 py-3">
        <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[7.5px] uppercase tracking-[0.18em] text-[var(--color-paper-fold)]">
          <span
            className={cn('h-1.5 w-1.5 rounded-full', connected ? 'animate-pulse' : '')}
            style={{ background: connected ? '#8FA468' : 'var(--color-ink-faint)' }}
          />
          Live trace
          <span className="ml-auto normal-case tracking-[0.06em] text-[var(--color-ink-faint)]">
            sse · /api/v1/batches/{batch.id.slice(0, 6)}/stream
          </span>
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {events.length === 0 ? (
            <p className="font-mono text-[8.5px] text-[var(--color-ink-faint)]">
              stream open · activity will appear here
            </p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="flex gap-2.5 font-mono text-[8.5px] leading-[1.7]">
                <span className="flex-shrink-0 text-[var(--color-ink-faint)]">
                  {e.at.toLocaleTimeString([], { hour12: false })}
                </span>
                <span className="text-[#8FA468]">{e.name}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--color-paper-fold)]">
                  {typeof e.payload === 'object' && e.payload !== null
                    ? JSON.stringify(e.payload)
                    : String(e.payload)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="px-1 font-display italic text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
        The same trace Langfuse keeps, retold at phone width. Nothing the extractor does is off the record.
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 text-center">
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-0.5 font-display text-[16px] tnum">{value}</p>
    </div>
  );
}

function IngestRow({ ingest, first }: { ingest: BackendIngest; first: boolean }) {
  const meta = INGEST_META[ingest.status];
  const tone = TONE[meta.tone];
  const txnIds = ingest.produced?.transaction_ids ?? [];
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5',
        !first && 'border-t border-[var(--color-rule-soft)]',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[9.5px]">{ingest.filename}</span>
        <span className="mt-0.5 block truncate font-mono text-[7.5px] tracking-[0.04em] text-[var(--color-ink-faint)]">
          {ingest.error ? (
            <span className="text-[var(--color-accent)]">{ingest.error.slice(0, 60)}</span>
          ) : txnIds.length > 0 ? (
            <>
              → {txnIds.map((id) => (
                <Link key={id} {...receiptLink(id)} className="text-[var(--color-accent)]">
                  {id.slice(0, 8)}
                </Link>
              ))}
            </>
          ) : (
            ingest.classification?.replace('_', ' ') ?? '—'
          )}
        </span>
      </span>
      <span
        className={cn(
          'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] font-mono text-[7.5px] uppercase tracking-[0.1em]',
          tone.box,
        )}
      >
        <span className={cn('h-[5px] w-[5px] rounded-full', tone.dot, tone.pulse && 'animate-pulse')} />
        {meta.label}
      </span>
    </div>
  );
}
