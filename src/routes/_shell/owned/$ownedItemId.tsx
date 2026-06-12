import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listOwnedItemsExpanded, patchOwnedItem } from '../../../lib/api/things';
import { daysHeld, perDay, ownedStatus, classGlyph } from '../../../lib/things';
import { useBack } from '../../../lib/useBack';
import { cn } from '../../../lib/utils';

export const Route = createFileRoute('/_shell/owned/$ownedItemId')({
  component: OwnedDetailRoute,
});

const PLAN_PRESETS = [
  { label: '1 y', days: 365 },
  { label: '3 y', days: 1095 },
  { label: '5 y', days: 1825 },
  { label: '10 y', days: 3650 },
];

/**
 * /owned/$id — daily cost + achievement plan (board screen 11):
 * paid ÷ days held = today's $/day, converging on the target the plan
 * sets. target_days persists via PATCH; retiring (sold) is one tap.
 */
function OwnedDetailRoute() {
  const { ownedItemId } = Route.useParams();
  const back = useBack('/owned');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);

  // Reuse the expanded list cache (same payload the grid loaded) — a
  // dedicated GET wouldn't carry the product/paid context.
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['owned-items', 'expanded'],
    queryFn: () => listOwnedItemsExpanded({ include_retired: true }),
  });
  const item = items.find((i) => i.id === ownedItemId);

  const patchMut = useMutation({
    mutationFn: (body: Parameters<typeof patchOwnedItem>[1]) =>
      patchOwnedItem(ownedItemId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owned-items'] }),
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  if (isLoading) {
    return (
      <p className="py-16 text-center font-display italic text-[var(--color-ink-muted)]">
        loading…
      </p>
    );
  }
  if (!item) {
    return (
      <p className="py-16 text-center font-display italic text-[var(--color-ink-muted)]">
        Item not found.
      </p>
    );
  }

  const days = daysHeld(item);
  const pd = perDay(item);
  const paid = item.paid_minor != null ? item.paid_minor / 100 : null;
  const target = item.target_days ?? null;
  const progress = target && days ? Math.min(100, (days / target) * 100) : null;
  const targetPerDay = target && paid !== null ? paid / target : null;
  const status = ownedStatus(item);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={back}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          ← Things
        </button>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          daily cost · amortization
        </span>
      </div>

      {/* hero */}
      <div className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-[18px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)]">
        <span aria-hidden="true" className="text-[64px] text-[var(--color-ink-faint)]">
          {classGlyph(item.item_class)}
        </span>
        <span className="absolute bottom-3 left-3 rounded-full bg-[color:rgba(251,247,238,0.92)] px-2.5 py-1 font-mono text-[8.5px] text-[var(--color-ink-soft)]">
          ● {status}
          {item.acquired_on ? ` · since ${item.acquired_on}` : ''}
        </span>
      </div>

      <div>
        <h1 className="font-display text-[22px] font-medium leading-tight tracking-tight">
          {item.product_name ?? 'Unnamed item'}
        </h1>
        <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
          {item.item_class ?? '—'}
          {item.payee ? ` · ${item.payee}` : ''}
          {item.serial_number ? ` · sn ${item.serial_number}` : ''}
        </p>
      </div>

      {/* big cost */}
      <div>
        <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          DAILY COST · ALL-IN AMORTIZED
        </p>
        <p className="mt-1 font-display text-[2.6rem] font-light leading-none tracking-tight tnum">
          {pd !== null ? `$${pd.toFixed(2)}` : '—'}
          <span className="ml-1 text-[15px] tracking-[0.06em] text-[var(--color-ink-soft)]">/day</span>
        </p>
      </div>

      {/* calc row */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center rounded-[13px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-3 py-3 text-center">
        <Calc label="paid" value={paid !== null ? `$${paid.toLocaleString()}` : '—'} />
        <span className="font-display text-[15px] text-[var(--color-ink-faint)]">÷</span>
        <Calc label="days held" value={days !== null ? days.toLocaleString() : '—'} />
        <span className="font-display text-[15px] text-[var(--color-ink-faint)]">=</span>
        <Calc label="today" value={pd !== null ? `$${pd.toFixed(2)}` : '—'} accent />
      </div>

      {/* achievement plan */}
      <section className="rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-3.5">
        <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
          ★ Achievement plan
        </p>
        {target ? (
          <>
            <div className="mt-2.5 flex items-baseline justify-between">
              <p className="font-display text-[15px]">
                <em className="italic text-[var(--color-accent)]">{target.toLocaleString()}</em>{' '}
                days
              </p>
              <p className="font-mono text-[9px] text-[var(--color-ink-muted)]">
                ~ {(target / 365).toFixed(1)} years
              </p>
            </div>
            <div className="mt-2 h-[7px] overflow-hidden rounded-full bg-[var(--color-rule-soft)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[8.5px] text-[var(--color-ink-muted)]">
              <span>
                {days?.toLocaleString() ?? 0} / {target.toLocaleString()} days
              </span>
              <span className="font-semibold text-[var(--color-accent)]">
                {progress?.toFixed(1)}% achieved
              </span>
            </div>
            {targetPerDay !== null && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <PlanCell label="target $/day" value={`$${targetPerDay.toFixed(2)}`} tone="olive" />
                <PlanCell label="current" value={pd !== null ? `$${pd.toFixed(2)}` : '—'} tone="accent" />
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-[11.5px] leading-snug text-[var(--color-ink-muted)]">
            Set a lifespan target and this card tracks the $/day convergence.
          </p>
        )}
        <div className="mt-3 flex gap-1.5">
          {PLAN_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              disabled={patchMut.isPending}
              onClick={() => patchMut.mutate({ target_days: p.days })}
              className={cn(
                'flex-1 rounded-full border-[0.5px] py-1.5 font-mono text-[9px] uppercase tracking-[0.06em] transition-colors',
                target === p.days
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-rule)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-muted)]',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {err && <p className="text-center text-xs text-[var(--color-stamp)]">{err}</p>}

      {/* lifecycle actions */}
      <div className="grid grid-cols-2 gap-2 pb-4">
        {status === 'in use' ? (
          <button
            type="button"
            disabled={patchMut.isPending}
            onClick={() => patchMut.mutate({ condition: 'idle' })}
            className="rounded-[12px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] py-2.5 font-display text-[13px] font-medium text-[var(--color-ink-soft)]"
          >
            Mark idle
          </button>
        ) : (
          <button
            type="button"
            disabled={patchMut.isPending || Boolean(item.retired_at)}
            onClick={() => patchMut.mutate({ condition: 'new' })}
            className="rounded-[12px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] py-2.5 font-display text-[13px] font-medium text-[var(--color-ink-soft)] disabled:opacity-40"
          >
            Back in use
          </button>
        )}
        {item.retired_at ? (
          <button
            type="button"
            disabled={patchMut.isPending}
            onClick={() => patchMut.mutate({ retired_at: null })}
            className="rounded-[12px] bg-[var(--color-ink)] py-2.5 font-display text-[13px] font-medium text-[var(--color-paper)]"
          >
            ↺ Un-retire
          </button>
        ) : (
          <button
            type="button"
            disabled={patchMut.isPending}
            onClick={() => {
              patchMut.mutate(
                { condition: 'sold', retired_at: new Date().toISOString() },
                { onSuccess: () => navigate({ to: '/owned' }) },
              );
            }}
            className="rounded-[12px] border-[0.5px] border-[color:rgba(181,52,26,0.45)] py-2.5 font-display text-[13px] font-medium text-[var(--color-accent)]"
          >
            Sold / retired
          </button>
        )}
      </div>
    </div>
  );
}

function Calc({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-display text-[16px] tnum',
          accent && 'text-[var(--color-accent)]',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PlanCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'olive' | 'accent';
}) {
  return (
    <div
      className={cn(
        'rounded-[10px] border-[0.5px] px-3 py-2 text-center',
        tone === 'olive'
          ? 'border-[color:rgba(92,107,61,0.4)]'
          : 'border-[color:rgba(181,52,26,0.4)]',
      )}
    >
      <p className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-display text-[15px] tnum',
          tone === 'olive' ? 'text-[var(--color-olive)]' : 'text-[var(--color-accent)]',
        )}
      >
        {value}
      </p>
    </div>
  );
}
