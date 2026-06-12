import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { listOwnedItemsExpanded } from '../../../lib/api/things';
import {
  ownedStatus,
  daysHeld,
  perDay,
  fmtPerDay,
  classGlyph,
  type OwnedStatus,
} from '../../../lib/things';
import { cn } from '../../../lib/utils';

export const Route = createFileRoute('/_shell/owned/')({
  component: OwnedRoute,
});

const SEGMENTS: Array<{ key: 'all' | OwnedStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'in use', label: 'use' },
  { key: 'idle', label: 'idle' },
  { key: 'sold', label: 'sold' },
];

/**
 * /owned — the Things tab (board screens 09–10): every durable purchase
 * as an owned item, amortized to a $/day. Rows are agent-created at
 * ingest (#84 Phase 2) plus manual additions; the stats strip carries
 * the asset-dashboard headline (value · daily · count).
 */
function OwnedRoute() {
  const [seg, setSeg] = useState<'all' | OwnedStatus>('all');
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['owned-items', 'expanded'],
    queryFn: () => listOwnedItemsExpanded({ include_retired: true }),
  });

  const live = useMemo(() => items.filter((i) => !i.retired_at), [items]);
  const totalValueMinor = useMemo(
    () => live.reduce((s, i) => s + (i.paid_minor ?? 0), 0),
    [live],
  );
  const dailyTotal = useMemo(
    () => live.reduce((s, i) => s + (perDay(i) ?? 0), 0),
    [live],
  );

  const filtered = useMemo(
    () => (seg === 'all' ? items : items.filter((i) => ownedStatus(i) === seg)),
    [items, seg],
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between pt-2">
        <div>
          <h1 className="font-display text-3xl tracking-tight">My things</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            derived from owned_items
          </p>
        </div>
        <Link
          to="/wish"
          className="rounded-full border-[0.5px] border-[var(--color-rule)] px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
        >
          Wishes →
        </Link>
      </header>

      {/* segmented control */}
      <div className="flex rounded-[11px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)] p-[3px]">
        {SEGMENTS.map((s) => {
          const count =
            s.key === 'all' ? items.length : items.filter((i) => ownedStatus(i) === s.key).length;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSeg(s.key)}
              className={cn(
                'flex-1 rounded-[9px] py-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors',
                seg === s.key
                  ? 'bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm'
                  : 'text-[var(--color-ink-muted)]',
              )}
            >
              {s.label} {count}
            </button>
          );
        })}
      </div>

      {/* owned-stats strip (board screen 09/10 headline) */}
      <div className="grid grid-cols-3 divide-x divide-[var(--color-rule-soft)] rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] py-3">
        <Stat label="Value" value={`$${Math.round(totalValueMinor / 100).toLocaleString()}`} />
        <Stat label="Daily" value={`$${dailyTotal.toFixed(2)}`} accent />
        <Stat label="Items" value={String(live.length)} />
      </div>

      {isLoading ? (
        <p className="py-10 text-center font-display italic text-[var(--color-ink-muted)]">
          counting your things…
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border-[0.5px] border-dashed border-[var(--color-rule)] px-5 py-8 text-center">
          <p className="font-display italic text-[15px] text-[var(--color-ink-soft)]">
            Nothing here yet — durable purchases become owned items automatically at ingest.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((it) => {
            const status = ownedStatus(it);
            const days = daysHeld(it);
            return (
              <Link
                key={it.id}
                to="/owned/$ownedItemId"
                params={{ ownedItemId: it.id }}
                className="overflow-hidden rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-rule)]"
              >
                <div className="relative flex aspect-[4/3] items-center justify-center bg-[var(--color-paper-deep)]">
                  <span aria-hidden="true" className="text-[34px] text-[var(--color-ink-faint)]">
                    {classGlyph(it.item_class)}
                  </span>
                  <span
                    className={cn(
                      'absolute left-2 top-2 rounded-full px-2 py-[2px] font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--color-paper)]',
                      status === 'in use' && 'bg-[var(--color-olive)]',
                      status === 'idle' && 'bg-[var(--color-amber)]',
                      status === 'retired' && 'bg-[var(--color-ink-muted)]',
                      status === 'sold' && 'bg-[var(--color-accent)]',
                    )}
                  >
                    {status}
                  </span>
                </div>
                <div className="px-2.5 pb-2.5 pt-2">
                  <p className="truncate font-display text-[12.5px] font-medium leading-tight">
                    {it.product_name ?? 'Unnamed item'}
                  </p>
                  <p className="mt-1 flex items-baseline justify-between font-mono text-[9px]">
                    <span className="font-semibold text-[var(--color-accent)]">
                      {fmtPerDay(perDay(it))}
                    </span>
                    <span className="text-[var(--color-ink-muted)]">
                      {days !== null ? `${days.toLocaleString()} d` : '—'}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--color-ink-faint)]">
                    {it.item_class ?? '—'}
                    {it.payee ? ` · ${it.payee}` : ''}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-3 text-center">
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-display text-[17px] font-normal tnum',
          accent && 'italic text-[var(--color-accent)]',
        )}
      >
        {value}
      </p>
    </div>
  );
}
