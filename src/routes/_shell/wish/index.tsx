import { useId, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  createWishItem,
  listOwnedItemsExpanded,
  listWishItems,
} from '../../../lib/api/things';
import {
  wishPerDay,
  fmtPerDay,
  fmtDollars,
  fmtPrice,
  fmtYears,
  isSnoozed,
  perDay,
  dollarsToMinor,
  yearsToDays,
} from '../../../lib/things';
import {
  captureFailureMessage,
  isFailed,
  isReading,
  wishListKey,
  wishProblemMessage,
} from '../../../lib/wishPlaces';
import { cn } from '../../../lib/utils';
import { PlaceWishes } from '../../../components/PlaceWishes';
import { WishThumb } from '../../../components/WishImage';
import { SegmentedControl, ThingsSwitch } from '../../../components/Segmented';

const SECTIONS = [
  { key: 'places', label: 'Places' },
  { key: 'things', label: 'Things' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

// The section lives in the URL so a reload, or coming back from a detail
// page, lands where the user was. Absent (or anything else) means Places.
const wishSearch = z.object({
  section: z.enum(['places', 'things']).optional().catch(undefined),
  // The Visited list under Places is open.
  visited: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/_shell/wish/')({
  validateSearch: wishSearch,
  component: WishRoute,
});

type Pill = 'all' | 'now' | 'soon' | 'someday' | 'snoozed';
const PILLS: Pill[] = ['all', 'now', 'soon', 'someday', 'snoozed'];

/**
 * /wish — Wanting, the other half of the Things tab. Two sections: places
 * to go to (first, and the default) and things to buy.
 */
function WishRoute() {
  const search = Route.useSearch();
  const section: Section = search.section ?? 'places';
  const navigate = Route.useNavigate();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <ThingsSwitch active="wanting" />

      <header className="flex items-start justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl tracking-tight">Wanting</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
            {section === 'places' ? 'places to go' : 'things to buy'} · derived from wish_items
          </p>
        </div>
        {section === 'things' && (
          // One width for both labels, so the header does not move when
          // the form opens: both are laid in the same grid cell and the
          // one not shown is only hidden. "× hide" is as short as "+ wish",
          // so the subtitle beside it still fits one line on a phone.
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => setAdding((v) => !v)}
            className="grid shrink-0 whitespace-nowrap rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-paper)]"
          >
            <span className={cn('col-start-1 row-start-1', adding && 'invisible')}>+ wish</span>
            <span className={cn('col-start-1 row-start-1', !adding && 'invisible')}>× hide</span>
          </button>
        )}
      </header>

      <SegmentedControl
        label="Kind of wish"
        options={SECTIONS}
        value={section}
        onChange={(key) => {
          setAdding(false);
          void navigate({ search: { section: key }, replace: true });
        }}
      />

      {section === 'places' ? (
        <PlaceWishes
          showVisited={search.visited === true}
          onShowVisited={(open) =>
            void navigate({
              search: (prev) => ({ ...prev, visited: open ? true : undefined }),
              replace: true,
            })
          }
        />
      ) : (
        <ThingWishes adding={adding} onAdded={() => setAdding(false)} />
      )}
    </div>
  );
}

/**
 * The wishlist of things (board screen 12): the same machinery as owned,
 * run forward. Each wish projects a $/day; the header shows what the
 * whole list would do to the portfolio's daily cost if acquired.
 */
function ThingWishes({ adding, onAdded }: { adding: boolean; onAdded: () => void }) {
  const [pill, setPill] = useState<Pill>('all');
  const { data: wishes = [], isLoading } = useQuery({
    queryKey: wishListKey('thing', 'active'),
    queryFn: () => listWishItems({ status: 'active', kind: 'thing' }),
    // A thing read again from its image is `reading` for a while.
    refetchInterval: (query) => (query.state.data?.some(isReading) ? 3000 : false),
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
      {adding && <AddWishForm onDone={onAdded} />}

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
          <Stat
            label="Proj. daily"
            value={wishes.some((w) => wishPerDay(w) !== null) ? `+$${projDaily.toFixed(2)}` : '—'}
            accent
          />
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
            // The image behind it is being read, or could not be read:
            // that is said before anything else about it.
            const capture = isReading(w) ? 'reading' : isFailed(w) ? 'not read' : null;
            // Badge tint: the capture's state wins, then snoozing, then
            // the three urgency buckets.
            const badgeTint = ((): string => {
              if (capture === 'not read') return 'bg-[var(--color-stamp)]';
              if (capture === 'reading') return 'bg-[var(--color-ink-muted)]';
              if (snoozed) return 'bg-[var(--color-ink-faint)]';
              if (w.urgency === 'now') return 'bg-[var(--color-accent)]';
              if (w.urgency === 'soon') return 'bg-[var(--color-amber)]';
              return 'bg-[var(--color-slate)]';
            })();
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
                  {w.has_image ? (
                    <WishThumb
                      wish={w}
                      dimmed={capture === 'not read'}
                      className={cn('absolute inset-0', capture === 'reading' && 'animate-pulse')}
                    />
                  ) : (
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
                  )}
                  <span
                    className={cn(
                      'absolute left-2 top-2 rounded-full px-2 py-[2px] font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--color-paper)]',
                      badgeTint,
                    )}
                  >
                    {capture ?? (snoozed ? 'snoozed' : w.urgency)}
                  </span>
                </div>
                <div className="px-2.5 pb-2.5 pt-2">
                  {/* Not read: the title is the server's placeholder or a
                      description of the image, not a name, so it is not
                      shown as one (as on the Places list). */}
                  <p
                    className={cn(
                      'font-display text-[12.5px] font-medium leading-tight',
                      capture === null ? 'truncate' : 'italic text-[var(--color-ink-muted)]',
                    )}
                  >
                    {capture === 'reading'
                      ? 'Reading…'
                      : capture === 'not read'
                        ? captureFailureMessage(w)
                        : w.title}
                  </p>
                  <p className="mt-1 flex items-baseline justify-between font-mono text-[9px]">
                    <span className="font-semibold text-[var(--color-olive)]">
                      {fmtPrice(w.target_price_minor)}
                    </span>
                    <span className="text-[var(--color-ink-muted)]">
                      {wishPerDay(w) !== null
                        ? `${fmtPerDay(wishPerDay(w))} · ${fmtYears(w.planned_days ?? 0)}y`
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
  // Both numbers are optional; what is typed must parse, the same rules as
  // the fields on a wish's own page. A field that does not parse is marked
  // and says why, and the form is not sent.
  const priceText = price.trim();
  const yearsText = years.trim();
  const priceMinor = priceText ? dollarsToMinor(priceText) : null;
  const plannedDays = yearsText ? yearsToDays(yearsText) : null;
  const priceBad = priceText !== '' && priceMinor === null;
  const yearsBad = yearsText !== '' && plannedDays === null;
  const createMut = useMutation({
    mutationFn: () =>
      createWishItem({
        title: title.trim(),
        target_price_minor: priceMinor ?? undefined,
        planned_days: plannedDays ?? undefined,
        urgency,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wish-items'] });
      onDone();
    },
  });
  const canSend = title.trim() !== '' && !priceBad && !yearsBad && !createMut.isPending;
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) createMut.mutate();
      }}
      className="space-y-2.5 rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] p-3.5"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What do you want?"
        aria-label="What do you want?"
        className="w-full rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper)] px-3 py-2 font-display text-[14px] outline-none placeholder:font-mono placeholder:text-[11px] placeholder:text-[var(--color-ink-faint)]"
      />
      <div className="grid grid-cols-2 gap-2">
        <AddNumber
          label="target $"
          value={price}
          onChange={setPrice}
          placeholder="499"
          invalid={priceBad}
          hint="An amount in dollars, like 499 or 12.50"
        />
        <AddNumber
          label="planned years"
          value={years}
          onChange={setYears}
          invalid={yearsBad}
          hint="A number of years, like 4 or 2.5"
        />
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
      {createMut.isError && (
        <p role="alert" className="text-xs text-[var(--color-stamp)]">
          {wishProblemMessage(createMut.error)}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSend}
        className="w-full rounded-[12px] bg-[var(--color-ink)] py-2.5 font-display text-[14px] font-medium text-[var(--color-paper)] disabled:opacity-50"
      >
        {createMut.isPending ? 'Saving…' : 'Add wish'}
      </button>
    </form>
  );
}

/** A number field of the add form; marked, with a line saying what it
 *  takes, while what is typed does not parse. */
function AddNumber({
  label,
  value,
  onChange,
  placeholder,
  invalid,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid: boolean;
  hint: string;
}) {
  const hintId = useId();
  return (
    <label className="block">
      <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={invalid ? hintId : undefined}
        className={cn(
          'mt-1 w-full rounded-[10px] border-[0.5px] bg-[var(--color-paper)] px-3 py-2 font-mono text-[13px] outline-none',
          invalid ? 'border-[var(--color-stamp)]' : 'border-[var(--color-rule-soft)]',
        )}
      />
      {invalid && (
        <span id={hintId} className="mt-1 block text-[11px] leading-snug text-[var(--color-stamp)]">
          {hint}
        </span>
      )}
    </label>
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
