import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  listBatches,
  listTransactions,
  dismissNearDupFlag,
  extractProblemMessage,
  type BackendBatchSummary,
} from '../lib/api';
import { cn } from '../lib/utils';
import { qk } from '../lib/queryKeys';
import { receiptLink } from '../lib/navLinks';

interface BatchesProps {
  onSelectBatch: (batchId: string) => void;
}

/** Batch-row status → editorial badge (board screen 27). A near-dup or
 *  failed count promotes the row badge above the raw lifecycle status. */
function badgeFor(batch: BackendBatchSummary): { label: string; tone: string } {
  const c = batch.counts ?? ({} as BackendBatchSummary['counts']);
  if ((c.error ?? 0) > 0) return { label: `${c.error} failed`, tone: 'err' };
  if ((c.near_dup ?? 0) > 0) return { label: 'near-dup', tone: 'flag' };
  if ((c.dedup ?? 0) > 0 && (c.done ?? 0) === 0) return { label: 'dedup · skipped', tone: 'skip' };
  switch (batch.status) {
    case 'reconciled':
      return { label: 'reconciled', tone: 'ok' };
    case 'failed':
    case 'reconcile_error':
      return { label: 'failed', tone: 'err' };
    default:
      return { label: 'processing', tone: 'proc' };
  }
}

const TONE: Record<string, { box: string; dot: string; pulse?: boolean }> = {
  ok: { box: 'bg-[color:rgba(92,107,61,0.15)] text-[var(--color-olive)]', dot: 'bg-[var(--color-olive)]' },
  proc: { box: 'bg-[color:rgba(188,134,36,0.16)] text-[var(--color-amber)]', dot: 'bg-[var(--color-amber)]', pulse: true },
  flag: { box: 'bg-[color:rgba(188,134,36,0.16)] text-[var(--color-amber)]', dot: 'bg-[var(--color-amber)]' },
  err: { box: 'bg-[color:rgba(181,52,26,0.13)] text-[var(--color-accent)]', dot: 'bg-[var(--color-accent)]' },
  skip: { box: 'bg-[color:rgba(63,85,99,0.13)] text-[var(--color-slate)]', dot: 'bg-[var(--color-slate)]' },
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today · ${time}`;
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
}

/**
 * Uploads — the ingest batch history (board screen 27): an amber
 * near-dup needs-review panel over a list of batches, each with an
 * editorial status badge. Tap a row for the live trace.
 */
export default function Batches({ onSelectBatch }: BatchesProps) {
  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: qk.batches.list({ limit: 50 }),
    queryFn: () => listBatches({ limit: 50 }),
  });
  const items = data?.items ?? [];
  const error = queryError ? extractProblemMessage(queryError) : null;

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="font-display text-3xl tracking-tight">Uploads</h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          {items.length} batches · every file accountable
        </p>
      </header>

      <NeedsReviewSection />

      <div className="flex items-baseline justify-between pt-1">
        <h2 className="font-display italic text-[1.2rem] font-medium leading-none tracking-tight">
          batches
        </h2>
      </div>

      {loading ? (
        <p className="py-8 text-center font-display italic text-[var(--color-ink-muted)]">loading…</p>
      ) : error ? (
        <p className="py-8 text-center text-[var(--color-stamp)]">{error}</p>
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border-[0.5px] border-dashed border-[var(--color-rule)] px-5 py-8 text-center">
          <p className="font-display italic text-[15px] text-[var(--color-ink-soft)]">
            No uploads yet. Snap a receipt to start a batch.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)]">
          {items.map((b, idx) => (
            <BatchRow key={b.id} batch={b} first={idx === 0} onClick={() => onSelectBatch(b.id)} />
          ))}
        </div>
      )}

      <p className="px-1 pt-1 font-display italic text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
        Exact duplicates skip silently;{' '}
        <span className="font-mono not-italic text-[10px] text-[var(--color-amber)]">near_dup</span>{' '}
        earns an amber flag and waits for a human verdict.
      </p>
    </div>
  );
}

function BatchRow({
  batch,
  first,
  onClick,
}: {
  batch: BackendBatchSummary;
  first: boolean;
  onClick: () => void;
}) {
  const total = batch.file_count ?? 0;
  const badge = badgeFor(batch);
  const tone = TONE[badge.tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left',
        !first && 'border-t border-[var(--color-rule-soft)]',
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)] text-[13px] text-[var(--color-ink-soft)]"
      >
        ⇪
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[12.5px] font-medium">{fmtWhen(batch.created_at)}</span>
        <span className="mt-0.5 block font-mono text-[8.5px] tracking-[0.04em] text-[var(--color-ink-muted)]">
          {total} file{total === 1 ? '' : 's'} · {batch.id.slice(0, 8)}
        </span>
      </span>
      <span
        className={cn(
          'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] font-mono text-[7.5px] uppercase tracking-[0.1em]',
          tone.box,
        )}
      >
        <span className={cn('h-[5px] w-[5px] rounded-full', tone.dot, tone.pulse && 'animate-pulse')} />
        {badge.label}
      </span>
    </button>
  );
}

/**
 * #134 branch-4 review queue: transactions the extraction agent
 * inserted but flagged (a same-amount/date candidate existed and
 * neither side carried a strong tiebreaker). Hidden entirely when
 * empty. Dismiss = "I checked; they are distinct purchases".
 */
function NeedsReviewSection() {
  const queryClient = useQueryClient();
  const flaggedKey = ['transactions', 'flagged', 'near_dup'] as const;
  const { data } = useQuery({
    queryKey: flaggedKey,
    queryFn: () => listTransactions({ flagged: 'near_dup', limit: 50 }),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissNearDupFlag(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: flaggedKey }),
  });
  const flagged = data?.items ?? [];
  if (flagged.length === 0) return null;

  return (
    <section className="rounded-[13px] border-[0.5px] border-l-[3px] border-[color:rgba(188,134,36,0.45)] border-l-[var(--color-amber)] bg-[color:rgba(188,134,36,0.10)] px-3.5 py-3">
      <p className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--color-amber)]">
        <span>⚠ Needs review · near-duplicate</span>
        <span>{flagged.length} flagged</span>
      </p>
      <div className="mt-2.5 space-y-2">
        {flagged.map((t) => {
          const check = (t.metadata as Record<string, any> | null)?.near_dup_check ?? {};
          const candidate: string | undefined = check.candidate_transaction_id;
          return (
            <div key={t.id} className="rounded-[10px] bg-[var(--color-surface)] px-3 py-2">
              <Link
                {...receiptLink(t.id)}
                className="block font-display text-[13.5px] font-medium leading-tight hover:text-[var(--color-accent)]"
              >
                {t.payee ?? 'Unknown payee'}{' '}
                <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">· {t.occurred_on}</span>
              </Link>
              <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--color-ink-soft)]">
                Same amount + day as an existing transaction, no order number to tell them apart.
                {check.reason ? ` ${String(check.reason).slice(0, 80)}` : ''}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {candidate && (
                  <Link
                    {...receiptLink(candidate)}
                    className="rounded-full bg-[var(--color-ink)] px-3 py-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-paper)]"
                  >
                    view candidate ›
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => dismiss.mutate(t.id)}
                  disabled={dismiss.isPending}
                  className="rounded-full border-[0.5px] border-[var(--color-rule)] px-3 py-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-ink-soft)] disabled:opacity-50"
                >
                  not a duplicate ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
