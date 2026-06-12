import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWishItem, listWishItems } from '../../../lib/api/things';
import { listOwnedItemsExpanded } from '../../../lib/api/things';
import { wishPerDay, fmtPerDay, fmtDollars, isSnoozed, perDay } from '../../../lib/things';
import { cn } from '../../../lib/utils';

export const Route = createFileRoute('/_shell/wish/')({
  component: WishRoute,
});

type Pill = 'all' | 'now' | 'soon' | 'someday' | 'snoozed';
const PILLS: Pill[] = ['all', 'now', 'soon', 'someday', 'snoozed'];

/**
 * /wish — the wishlist (board screen 12): the same machinery as owned,
 * run forward. Each wish projects a $/day; the header shows what the
 * whole list would do to the portfolio's daily cost if acquired.
 */
function WishRoute() {
  const [pill, setPill] = useState<Pill>('all');
  const [adding, setAdding] = useState(false);
  const { data: wishes = [], isLoading } = useQuery({
    queryKey: ['wish-items'],
    queryFn: () => listWishItems({ status: 'active' }),
  });
  const { data: owned = [] } = useQuery({
    queryKey: ['owned-items', 'expanded'],
    queryFn: () => listOwnedItemsExpanded({ include_retired: true }),
  });

  const ownedDaily = useMemo(
    () => owned.filter((i) => !i.retired_at).reduce((s, i) => s + (perDay(i) ?? 0), 0),
    [owned],
  );
  const projDaily = useMemo(
    () => wishes.reduce((s, w) => s + (wishPerDay(w) ?? 0), 0),
    [wishes],
  );
  const wishValueMinor = useMemo(
    () => wishes.reduce((s, w) => s + (w.target_price_minor ?? 0), 0),
    [wishes],
  );

  const filtered = useMemo(() => {
    if (pill === 'all') return wishes;
    if (pill === 'snoozed') return wishes.filter(isSnoozed);
    return wishes.filter((w) => w.urgency === pill && !isSnoozed(w));
  }, [wishes, pill]);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between pt-2">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Wanting</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            derived from wish_items
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/owned"
            className="rounded-full border-[0.5px] border-[var(--color-rule)] px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
          >
            ← Owned
          </Link>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-paper)]"
          >
            {adding ? '× close' : '+ wish'}
          </button>
        </div>
      </header>

      {adding && <AddWishForm onDone={() => setAdding(false)} />}

      {/* urgency pills */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {PILLS.map((p) => {
          const count =
            p === 'all'
              ? wishes.length
              : p === 'snoozed'
                ? wishes.filter(isSnoozed).length
                : wishes.filter((w) => w.urgency === p && !isSnoozed(w)).length;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPill(p)}
              className={cn(
                'flex-shrink-0 rounded-full border-[0.5px] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors',
                pill === p
                  ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                  : 'border-[var(--color-rule)] text-[var(--color-ink-soft)]',
              )}
            >
              {p} {count > 0 && `· ${count}`}
            </button>
          );
        })}
      </div>

      {/* wish stats + projection */}
      <div className="rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)]">
        <div className="grid grid-cols-3 divide-x divide-[var(--color-rule-soft)] py-3">
          <Stat label="Wish value" value={fmtDollars(wishValueMinor)} />
          <Stat label="Proj. daily" value={`+$${projDaily.toFixed(2)}`} accent />
          <Stat label="Items" value={String(wishes.length)} />
        </div>
        {ownedDaily > 0 && projDaily > 0 && (
          <p className="border-t border-[var(--color-rule-soft)] px-4 py-2 text-center font-mono text-[8.5px] tracking-[0.04em] text-[var(--color-ink-muted)]">
            if all acquired → daily cost{' '}
            <strong className="text-[var(--color-ink)]">
              ${ownedDaily.toFixed(2)} → ${(ownedDaily + projDaily).toFixed(2)}
            </strong>
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="py-10 text-center font-display italic text-[var(--color-ink-muted)]">
          gathering wishes…
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border-[0.5px] border-dashed border-[var(--color-rule)] px-5 py-8 text-center">
          <p className="font-display italic text-[15px] text-[var(--color-ink-soft)]">
            {wishes.length === 0
              ? 'Nothing wished for yet. The math is ready when you are.'
              : 'Nothing in this bucket.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((w) => {
            const snoozed = isSnoozed(w);
            return (
              <Link
                key={w.id}
                to="/wish/$wishId"
                params={{ wishId: w.id }}
                className={cn(
                  'overflow-hidden rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-rule)]',
                  snoozed && 'opacity-60',
                )}
              >
                <div className="relative flex aspect-[4/3] items-center justify-center bg-[var(--color-paper-deep)]">
                  <span
                    aria-hidden="true"
                    className="text-[34px] text-[var(--color-ink-faint)]"
                    style={{
                      background:
                        'repeating-linear-gradient(45deg, transparent 0 6px, rgba(140,130,115,0.06) 6px 8px)',
                    }}
                  >
                    ◇
                  </span>
                  <span
                    className={cn(
                      'absolute left-2 top-2 rounded-full px-2 py-[2px] font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--color-paper)]',
                      snoozed
                        ? 'bg-[var(--color-ink-faint)]'
                        : w.urgency === 'now'
                          ? 'bg-[var(--color-accent)]'
                          : w.urgency === 'soon'
                            ? 'bg-[var(--color-amber)]'
                            : 'bg-[var(--color-slate)]',
                    )}
                  >
                    {snoozed ? 'snoozed' : w.urgency}
                  </span>
                </div>
                <div className="px-2.5 pb-2.5 pt-2">
                  <p className="truncate font-display text-[12.5px] font-medium leading-tight">
                    {w.title}
                  </p>
                  <p className="mt-1 flex items-baseline justify-between font-mono text-[9px]">
                    <span className="font-semibold text-[var(--color-olive)]">
                      {fmtDollars(w.target_price_minor)}
                    </span>
                    <span className="text-[var(--color-ink-muted)]">
                      {wishPerDay(w) !== null
                        ? `${fmtPerDay(wishPerDay(w))} · ${((w.planned_days ?? 0) / 365).toFixed(0)}y`
                        : '—'}
                    </span>
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

function AddWishForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [years, setYears] = useState('4');
  const [urgency, setUrgency] = useState<'now' | 'soon' | 'someday'>('soon');
  const createMut = useMutation({
    mutationFn: () =>
      createWishItem({
        title: title.trim(),
        target_price_minor: price.trim() ? Math.round(Number(price) * 100) : undefined,
        planned_days: years.trim() ? Math.round(Number(years) * 365) : undefined,
        urgency,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wish-items'] });
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) createMut.mutate();
      }}
      className="space-y-2.5 rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] p-3.5"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want?"
        className="w-full rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper)] px-3 py-2 font-display text-[14px] outline-none placeholder:font-mono placeholder:text-[11px] placeholder:text-[var(--color-ink-faint)]"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
            target $
          </span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="499"
            className="mt-1 w-full rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper)] px-3 py-2 font-mono text-[13px] outline-none"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
            planned years
          </span>
          <input
            value={years}
            onChange={(e) => setYears(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper)] px-3 py-2 font-mono text-[13px] outline-none"
          />
        </label>
      </div>
      <div className="flex gap-1.5">
        {(['now', 'soon', 'someday'] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUrgency(u)}
            className={cn(
              'flex-1 rounded-full border-[0.5px] py-1.5 font-mono text-[9px] uppercase tracking-[0.08em]',
              urgency === u
                ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                : 'border-[var(--color-rule)] text-[var(--color-ink-soft)]',
            )}
          >
            {u}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={!title.trim() || createMut.isPending}
        className="w-full rounded-[12px] bg-[var(--color-ink)] py-2.5 font-display text-[14px] font-medium text-[var(--color-paper)] disabled:opacity-50"
      >
        {createMut.isPending ? 'Saving…' : 'Add wish'}
      </button>
    </form>
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
