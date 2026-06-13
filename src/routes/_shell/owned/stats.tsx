import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { listOwnedItemsExpanded, type OwnedItemExpanded } from '../../../lib/api/things';
import { ownedStatus, daysHeld, perDay, fmtPerDay, type OwnedStatus } from '../../../lib/things';
import { useBack } from '../../../lib/useBack';
import { cn } from '../../../lib/utils';

export const Route = createFileRoute('/_shell/owned/stats')({
  component: AssetDashboard,
});

const STATUS_ORDER: OwnedStatus[] = ['in use', 'idle', 'retired', 'sold'];
const STATUS_COLOR: Record<OwnedStatus, string> = {
  'in use': 'var(--color-olive)',
  idle: 'var(--color-amber)',
  retired: 'var(--color-ink-muted)',
  sold: 'var(--color-accent)',
};
const CAT_COLORS = [
  'var(--color-accent)',
  'var(--color-amber)',
  'var(--color-slate)',
  'var(--color-olive)',
  'var(--color-plum)',
  'var(--color-ink-faint)',
];

/**
 * Asset dashboard — board screen 10 (`/owned/stats`). The derived view
 * over owned_items: total value hero, lifecycle-status breakdown,
 * by-class donut, and the most cost-effective ranking. All math is
 * client-side from the expanded owned list (presentation, not a report
 * endpoint).
 */
function AssetDashboard() {
  const back = useBack('/owned');
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['owned-items', 'expanded'],
    queryFn: () => listOwnedItemsExpanded({ include_retired: true }),
  });

  const stats = useMemo(() => computeStats(items), [items]);

  if (isLoading) {
    return (
      <p className="py-16 text-center font-display italic text-[var(--color-ink-muted)]">
        tallying the shelf…
      </p>
    );
  }

  const { totalValueMinor, dailyMinor, byStatus, byClass, efficient, totalItems, catCount } = stats;
  const { whole, cents } = splitMinor(totalValueMinor);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={back}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          ← Things
        </button>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          assets · derived view
        </span>
      </div>

      {/* hero */}
      <section className="relative overflow-hidden rounded-[18px] bg-[var(--color-ink)] px-5 py-5 text-[var(--color-paper)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(181,52,26,0.4), transparent 70%)' }}
        />
        <p className="relative font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--color-paper-fold)]">
          TOTAL ASSET VALUE
        </p>
        <p className="relative mt-1.5 font-display text-[2.6rem] font-light leading-none tracking-tight tnum">
          ${whole.toLocaleString()}
          <span className="text-[0.5em] text-[var(--color-paper-fold)]">.{cents}</span>
        </p>
        <p className="relative mt-2 text-[11px] text-[color:rgba(221,211,190,0.85)]">
          <strong className="font-medium text-[var(--color-paper)]">{totalItems}</strong> items ·{' '}
          <strong className="font-medium text-[var(--color-paper)]">{catCount}</strong> classes · daily amortized{' '}
          <strong className="font-mono text-[#8FA468]">${(dailyMinor / 100).toFixed(2)}</strong>
        </p>
      </section>

      {/* By lifecycle status */}
      <section>
        <h2 className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          By lifecycle status
        </h2>
        <div className="mb-3 flex h-2.5 overflow-hidden rounded-full">
          {STATUS_ORDER.map((s) => {
            const v = byStatus[s].valueMinor;
            const pct = totalValueMinor > 0 ? (v / totalValueMinor) * 100 : 0;
            if (pct === 0) return null;
            return <span key={s} style={{ width: `${pct}%`, background: STATUS_COLOR[s] }} />;
          })}
        </div>
        <div className="rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-1">
          {STATUS_ORDER.map((s, i) => {
            const row = byStatus[s];
            const pct = totalValueMinor > 0 ? Math.round((row.valueMinor / totalValueMinor) * 100) : 0;
            return (
              <div
                key={s}
                className={cn(
                  'flex items-center gap-2.5 py-2 text-[11.5px]',
                  i > 0 && 'border-t border-[var(--color-rule-soft)]',
                )}
              >
                <span className="h-2 w-2 flex-shrink-0 rounded-[2px]" style={{ background: STATUS_COLOR[s] }} />
                <span className="flex-1 font-medium capitalize text-[var(--color-ink)]">{s}</span>
                <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">{row.count} items</span>
                <span className="w-16 text-right font-mono text-[10.5px] tnum">
                  ${Math.round(row.valueMinor / 100).toLocaleString()}
                </span>
                <span className="w-8 text-right font-mono text-[9px] text-[var(--color-ink-muted)]">{pct}%</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* By class — donut */}
      {byClass.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            By class
          </h2>
          <div className="flex items-center gap-4 rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-4">
            <Donut segments={byClass.map((c, i) => ({ value: c.valueMinor, color: CAT_COLORS[i % CAT_COLORS.length] }))} totalItems={totalItems} catCount={byClass.length} />
            <div className="min-w-0 flex-1 space-y-1.5">
              {byClass.map((c, i) => {
                const pct = totalValueMinor > 0 ? Math.round((c.valueMinor / totalValueMinor) * 100) : 0;
                return (
                  <div key={c.label} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2 w-2 flex-shrink-0 rounded-[2px]" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    <span className="flex-1 truncate font-medium capitalize text-[var(--color-ink)]">{c.label}</span>
                    <span className="font-mono text-[10px] tnum text-[var(--color-ink-soft)]">
                      ${Math.round(c.valueMinor / 100).toLocaleString()}
                    </span>
                    <span className="w-7 text-right font-mono text-[8.5px] text-[var(--color-ink-muted)]">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Most cost-effective */}
      {efficient.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            <span>Most cost-effective</span>
            <span className="text-[var(--color-ink-faint)]">$/day asc</span>
          </h2>
          <div className="rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4">
            {efficient.map((it, i) => (
              <div
                key={it.id}
                className={cn(
                  'flex items-center gap-3 py-2.5',
                  i > 0 && 'border-t border-[var(--color-rule-soft)]',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[12.5px] font-medium">
                    {it.product_name ?? 'Unnamed item'}
                  </span>
                  <span className="font-mono text-[8.5px] text-[var(--color-ink-muted)]">
                    {daysHeld(it)?.toLocaleString() ?? '—'} days ·{' '}
                    ${it.paid_minor != null ? Math.round(it.paid_minor / 100).toLocaleString() : '—'}
                  </span>
                </span>
                <span className="font-mono text-[11px] font-semibold text-[var(--color-accent)] tnum">
                  {fmtPerDay(perDay(it))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Donut({
  segments,
  totalItems,
  catCount,
}: {
  segments: Array<{ value: number; color: string }>;
  totalItems: number;
  catCount: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 30;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative h-[88px] w-[88px] flex-shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        {segments.map((seg, i) => {
          const len = (seg.value / total) * C;
          const el = (
            <circle
              key={i}
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth="10"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[18px] leading-none tnum">{totalItems}</span>
        <span className="font-mono text-[6.5px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
          {catCount} classes
        </span>
      </div>
    </div>
  );
}

interface Stats {
  totalValueMinor: number;
  dailyMinor: number;
  byStatus: Record<OwnedStatus, { count: number; valueMinor: number }>;
  byClass: Array<{ label: string; valueMinor: number }>;
  efficient: OwnedItemExpanded[];
  totalItems: number;
  catCount: number;
}

function computeStats(items: OwnedItemExpanded[]): Stats {
  const byStatus: Record<OwnedStatus, { count: number; valueMinor: number }> = {
    'in use': { count: 0, valueMinor: 0 },
    idle: { count: 0, valueMinor: 0 },
    retired: { count: 0, valueMinor: 0 },
    sold: { count: 0, valueMinor: 0 },
  };
  const classMap = new Map<string, number>();
  let totalValueMinor = 0;
  let dailyMinor = 0;

  for (const it of items) {
    const v = it.paid_minor ?? 0;
    totalValueMinor += v;
    const s = ownedStatus(it);
    byStatus[s].count += 1;
    byStatus[s].valueMinor += v;
    if (s === 'in use' || s === 'idle') {
      const pd = perDay(it);
      if (pd !== null) dailyMinor += pd * 100;
    }
    const cls = it.item_class ?? 'other';
    classMap.set(cls, (classMap.get(cls) ?? 0) + v);
  }

  const byClass = [...classMap.entries()]
    .map(([label, valueMinor]) => ({ label, valueMinor }))
    .sort((a, b) => b.valueMinor - a.valueMinor);

  const efficient = items
    .filter((it) => !it.retired_at && perDay(it) !== null)
    .sort((a, b) => (perDay(a) ?? Infinity) - (perDay(b) ?? Infinity))
    .slice(0, 5);

  return {
    totalValueMinor,
    dailyMinor,
    byStatus,
    byClass,
    efficient,
    totalItems: items.length,
    catCount: classMap.size,
  };
}

function splitMinor(minor: number): { whole: number; cents: string } {
  const abs = Math.abs(minor) / 100;
  return { whole: Math.floor(abs), cents: abs.toFixed(2).split('.')[1] ?? '00' };
}
