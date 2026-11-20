import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWishItem,
  deleteWishItem,
  getWishItem,
  listWishItems,
  patchWishItem,
  retryWishCapture,
  type WishItem,
} from '../lib/api/things';
import {
  UNPLACED_AREA,
  arrangePlaceWishes,
  captureFailureMessage,
  captureReadAt,
  fmtWhen,
  isFailed,
  isReading,
  isRereading,
  latestVisit,
  wishAltName,
  wishArea,
  wishCategory,
  wishClosure,
  wishListKey,
  wishProblemMessage,
  wishReading,
  type PlaceEntry,
  type WishClosure,
} from '../lib/wishPlaces';
import { useNow } from '../lib/useNow';
import {
  dismissMovedToThings,
  failedAgain,
  noteMovedToThings,
  noteRetry,
  unwatchCapture,
  useMovedToThings,
  useRetries,
  useWatchedCaptures,
  watchCapture,
} from '../lib/wishSession';
import { cn } from '../lib/utils';
import { BeenBeforeText, WishClosureText } from './WishClosure';
import { WishThumb } from './WishImage';

const ACTIVE_KEY = wishListKey('place', 'active');
const VISITED_KEY = wishListKey('place', 'converted');
const MAX_CHIPS = 3;

const LABEL = 'font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]';
const SMALL_ACTION =
  'rounded-full border-[0.5px] border-[var(--color-rule)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-50';

/**
 * The Places half of Wanting: restaurants (and cafes, bars, …) someone
 * recommended, saved from a screenshot or typed in, filed by area.
 *
 * A wish captured from an image arrives as `reading` and is filled in by
 * the server some seconds later, so the list polls while any card is in
 * that state and stops when none is.
 */
export function PlaceWishes({
  showVisited,
  onShowVisited,
}: {
  /** Whether the Visited list is open. The caller keeps it in the URL, so
   *  it is still open after a reload or on coming back from a receipt. */
  showVisited: boolean;
  onShowVisited: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [typing, setTyping] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: wishes = [], isLoading, error } = useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: () => listWishItems({ status: 'active', kind: 'place' }),
    refetchInterval: (query) => (query.state.data?.some(isReading) ? 3000 : false),
  });
  const { data: visited = [] } = useQuery({
    queryKey: VISITED_KEY,
    queryFn: () => listWishItems({ status: 'converted', kind: 'place' }),
  });

  // Captures read again (here or on their page): their card says so when
  // the reading fails once more, so the retry is not mistaken for a no-op.
  const retries = useRetries();
  const now = useNow();
  const layout = useMemo(() => arrangePlaceWishes(wishes, now), [wishes, now]);
  // The latest visit to each place, from the wishes for it that a visit
  // closed: a card for a place saved again after it says so.
  const visitByPlace = useMemo(() => {
    const byPlace = new Map<string, WishItem[]>();
    for (const w of visited) {
      if (!w.place_id) continue;
      const list = byPlace.get(w.place_id);
      if (list) list.push(w);
      else byPlace.set(w.place_id, [w]);
    }
    return new Map([...byPlace].map(([id, ws]) => [id, latestVisit(ws)]));
  }, [visited]);
  useWatchForThings(wishes);
  const movedToThings = useMovedToThings();
  const refresh = () => qc.invalidateQueries({ queryKey: ['wish-items'] });
  const onError = (e: unknown) => setErr(wishProblemMessage(e));

  // "Been there" takes the card out of the list at once; the refetch that
  // follows either confirms it or, after a failure, puts it back. A card
  // that folds several wishes for the place marks them all.
  const visitMut = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => patchWishItem(id, { status: 'converted' }))),
    onMutate: async (ids) => {
      setErr(null);
      await qc.cancelQueries({ queryKey: ACTIVE_KEY });
      const before = qc.getQueryData<WishItem[]>(ACTIVE_KEY);
      qc.setQueryData<WishItem[]>(ACTIVE_KEY, (list) => list?.filter((w) => !ids.includes(w.id)));
      return { before };
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.before) qc.setQueryData(ACTIVE_KEY, ctx.before);
      onError(e);
    },
    onSettled: refresh,
  });
  const retryMut = useMutation({
    mutationFn: (id: string) => retryWishCapture(id),
    onMutate: () => setErr(null),
    onSuccess: (wish) => {
      noteRetry(wish);
      watchCapture(wish.id);
      // Put the `reading` row in place now, so polling starts without
      // waiting for a refetch to notice.
      qc.setQueryData<WishItem[]>(ACTIVE_KEY, (list) =>
        list?.map((w) => (w.id === wish.id ? wish : w)),
      );
    },
    onError,
    onSettled: refresh,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWishItem(id),
    onMutate: () => setErr(null),
    onError,
    onSettled: refresh,
  });

  // `recent`: the card is in the "Just added" section, so it also says
  // which area it is filed under.
  const renderEntry = ({ wish: w, also }: PlaceEntry, recent: boolean) => {
    if (isReading(w)) return <ReadingCard key={w.id} wish={w} />;
    if (isFailed(w)) {
      return (
        <FailedCard
          key={w.id}
          wish={w}
          now={now}
          retried={failedAgain(w, retries)}
          busy={retryMut.isPending || deleteMut.isPending}
          onRetry={() => retryMut.mutate(w.id)}
          onDelete={() => deleteMut.mutate(w.id)}
        />
      );
    }
    return (
      <PlaceCard
        key={w.id}
        wish={w}
        also={also}
        area={recent ? wishArea(w) : null}
        before={(w.place_id && visitByPlace.get(w.place_id)?.closure) || null}
        onVisited={() => visitMut.mutate([w.id, ...also.map((a) => a.id)])}
      />
    );
  };

  const addRow = (
    <div className="space-y-2">
      <Link
        to="/add"
        search={{ mode: 'want' }}
        className="block w-full rounded-[14px] bg-[var(--color-ink)] py-3 text-center font-display text-[15px] font-medium text-[var(--color-paper)] transition-opacity hover:opacity-90"
      >
        Add from a screenshot
        <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-paper-fold)]">
          read for you · matched to the place
        </span>
      </Link>
      {typing ? (
        <AddPlaceForm onDone={() => setTyping(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setTyping(true)}
          className="block w-full py-1 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          or type a name
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {addRow}

      {err && <p className="text-center text-xs text-[var(--color-stamp)]">{err}</p>}

      {movedToThings.length > 0 && (
        <MovedToThings wishes={movedToThings} onDismiss={dismissMovedToThings} />
      )}

      {isLoading ? (
        <p className="py-10 text-center font-display italic text-[var(--color-ink-muted)]">
          gathering places…
        </p>
      ) : error ? (
        <p className="py-10 text-center text-xs text-[var(--color-stamp)]">
          {wishProblemMessage(error)}
        </p>
      ) : wishes.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border-[0.5px] border-dashed border-[var(--color-rule)] px-5 py-8 text-center">
          <p className="font-display text-[15px] italic leading-snug text-[var(--color-ink-soft)]">
            Someone recommended a restaurant? Save a screenshot of it here.
          </p>
          <p className="mt-2 text-[12px] leading-snug text-[var(--color-ink-muted)]">
            It is read for you and matched to the place, so the next time you are nearby you know
            where to go.
          </p>
        </div>
      ) : (
        <>
          {/* What was just saved (or read again) is shown here first, with
              the area it will be filed under, so it never lands out of
              sight in the middle of a long list. */}
          <section aria-live="polite" className="space-y-2">
            {layout.recent.length > 0 && (
              <>
                <h2 className={cn(LABEL, 'flex items-baseline justify-between px-0.5 text-[var(--color-accent)]')}>
                  <span>Just added</span>
                  <span className="ml-2 shrink-0 text-[var(--color-ink-faint)]">
                    {layout.recent.length}
                  </span>
                </h2>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {layout.recent.map((entry) => renderEntry(entry, true))}
                </div>
              </>
            )}
          </section>
          {layout.groups.map((g) => (
            <section key={g.area} className="space-y-2">
              <h2 className={cn(LABEL, 'flex items-baseline justify-between px-0.5')}>
                <span className="truncate">{g.area}</span>
                <span className="ml-2 shrink-0 text-[var(--color-ink-faint)]">{g.entries.length}</span>
              </h2>
              <div className="grid gap-2.5 md:grid-cols-2">
                {g.entries.map((entry) => renderEntry(entry, false))}
              </div>
            </section>
          ))}
        </>
      )}

      {visited.length > 0 && (
        <section className="space-y-2 pt-1">
          <button
            type="button"
            aria-expanded={showVisited}
            onClick={() => onShowVisited(!showVisited)}
            className={cn(LABEL, 'flex w-full items-baseline justify-between px-0.5 hover:text-[var(--color-ink)]')}
          >
            <span>
              {showVisited ? '▾' : '▸'} Visited
            </span>
            <span className="text-[var(--color-ink-faint)]">{visited.length}</span>
          </button>
          {showVisited && (
            <ul className="divide-y divide-[var(--color-rule-soft)] rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)]">
              {visited.map((w) => (
                <VisitedRow key={w.id} wish={w} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** A visited place: its name (to its page) and how it was closed, the
 *  receipt's line opening the receipt. Two links side by side, never one
 *  inside the other. */
function VisitedRow({ wish }: { wish: WishItem }) {
  const closure = wishClosure(wish);
  const area = wishArea(wish);
  return (
    <li className="px-3.5 py-2.5">
      <Link
        to="/wish/$wishId"
        params={{ wishId: wish.id }}
        className="flex items-baseline justify-between gap-3"
      >
        <span className="min-w-0 truncate font-display text-[13.5px] font-medium">{wish.title}</span>
        <span className="shrink-0 font-mono text-[9px] text-[var(--color-ink-muted)]">
          {area === UNPLACED_AREA ? '' : area}
        </span>
      </Link>
      {closure &&
        (closure.by === 'receipt' ? (
          <Link
            to="/receipt/$receiptId"
            params={{ receiptId: closure.transactionId }}
            className="mt-0.5 block truncate text-[11.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <WishClosureText closure={closure} kind="place" />
            <span className="text-[var(--color-accent)]"> →</span>
          </Link>
        ) : (
          <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">
            <WishClosureText closure={closure} kind="place" />
          </p>
        ))}
    </li>
  );
}

const CARD =
  'overflow-hidden rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)]';

/** The image a place wish was captured from, beside its card. */
function Thumb({ wish, dimmed }: { wish: WishItem; dimmed?: boolean }) {
  return <WishThumb wish={wish} dimmed={dimmed} className="aspect-[3/4] w-[84px] rounded-[10px]" />;
}

function PlaceCard({
  wish,
  also,
  area,
  before,
  onVisited,
}: {
  wish: WishItem;
  /** Other active wishes for the same place, folded into this card. */
  also: WishItem[];
  /** The area it is filed under, said on a card shown outside its area. */
  area: string | null;
  /** The latest visit to the place, when it was saved again after one. */
  before: WishClosure | null;
  onVisited: () => void;
}) {
  const reading = wishReading(wish);
  const alt = wishAltName(wish);
  const category = wishCategory(wish);
  const rating = wish.place?.rating ?? null;
  const highlights = reading?.highlights ?? [];
  const mapUri = wish.place?.google_maps_uri ?? null;
  const suggestion = wish.place ? null : wish.place_suggestion;
  return (
    <article className={CARD}>
      <Link
        to="/wish/$wishId"
        params={{ wishId: wish.id }}
        className="flex gap-3 p-3 transition-colors hover:bg-[var(--color-paper)]"
      >
        {wish.has_image && <Thumb wish={wish} />}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-display text-[16px] font-medium leading-tight tracking-tight [overflow-wrap:anywhere]">
            {wish.title}
            {alt && (
              <span className="ml-1.5 text-[13px] font-normal text-[var(--color-ink-muted)]">
                {alt}
              </span>
            )}
          </h3>
          {(category || rating != null) && (
            <p className="mt-1 font-mono text-[9.5px] text-[var(--color-ink-muted)]">
              {category}
              {category && rating != null && ' · '}
              {rating != null && (
                <span className="text-[var(--color-amber)]">★ {rating.toFixed(1)}</span>
              )}
            </p>
          )}
          {highlights.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {highlights.slice(0, MAX_CHIPS).map((h) => (
                <li
                  key={h}
                  title={h}
                  className="max-w-full truncate rounded-full bg-[var(--color-paper-deep)] px-2 py-[3px] text-[10.5px] leading-tight text-[var(--color-ink-soft)]"
                >
                  {h}
                </li>
              ))}
              {highlights.length > MAX_CHIPS && (
                <li className="rounded-full px-1 py-[3px] font-mono text-[9.5px] text-[var(--color-ink-muted)]">
                  +{highlights.length - MAX_CHIPS}
                </li>
              )}
            </ul>
          )}
          {before && (
            <p className="mt-1.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">
              <BeenBeforeText closure={before} />
            </p>
          )}
          {wish.notes && (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-[var(--color-ink-soft)] [overflow-wrap:anywhere]">
              {wish.notes}
            </p>
          )}
          {reading?.recommendedBy && (
            <p className="mt-1 truncate font-mono text-[9px] text-[var(--color-ink-muted)]">
              from {reading.recommendedBy}
            </p>
          )}
          {suggestion && (
            <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--color-accent)] [overflow-wrap:anywhere]">
              Is it {suggestion.name ?? 'this place'}
              {suggestion.formatted_address ? `, ${shortAddress(suggestion.formatted_address)}` : ''}?
              <span className="text-[var(--color-ink-muted)]"> Confirm on its page →</span>
            </p>
          )}
          {(also.length > 0 || (area && area !== UNPLACED_AREA)) && (
            <p className="mt-1 truncate font-mono text-[9px] text-[var(--color-ink-muted)]">
              {[
                area && area !== UNPLACED_AREA ? `in ${area}` : null,
                also.length > 0 ? `saved ${also.length + 1} times` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </Link>
      <CardActions>
        {mapUri && (
          <a href={mapUri} target="_blank" rel="noopener noreferrer" className={SMALL_ACTION}>
            Map ↗
          </a>
        )}
        <button type="button" onClick={onVisited} className={SMALL_ACTION}>
          Been there
        </button>
      </CardActions>
    </article>
  );
}

/** `1164 Galleria Way, Glendale, CA 91210, USA` → `1164 Galleria Way,
 *  Glendale`: enough to tell two branches apart on a card. */
function shortAddress(address: string): string {
  return address.split(',').slice(0, 2).join(',').trim();
}

function ReadingCard({ wish }: { wish: WishItem }) {
  return (
    <article className={cn(CARD, 'flex gap-3 p-3')} aria-busy="true">
      <div className="animate-pulse">
        <Thumb wish={wish} />
      </div>
      <div className="min-w-0 flex-1 self-center">
        <p className="font-display text-[15px] italic text-[var(--color-ink-muted)]">
          {isRereading(wish) ? 'Reading again…' : 'Reading…'}
        </p>
        <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">
          Working out what this is and where. It usually takes under a minute.
        </p>
      </div>
    </article>
  );
}

function FailedCard({
  wish,
  now,
  retried,
  busy,
  onRetry,
  onDelete,
}: {
  wish: WishItem;
  now: number;
  /** Read again from this list, and failed again. */
  retried: boolean;
  busy: boolean;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const readAt = captureReadAt(wish);
  return (
    <article className={CARD}>
      <div className="flex gap-3 p-3">
        <Thumb wish={wish} dimmed />
        <div className="min-w-0 flex-1 self-center">
          <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-stamp)]">
            {retried ? 'still not read' : 'not read'}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-[var(--color-ink-soft)]">
            {captureFailureMessage(wish)}
          </p>
          {readAt && (
            <p className="mt-1 font-mono text-[9px] text-[var(--color-ink-muted)]">
              {retried ? 'tried again' : 'tried'} {fmtWhen(readAt, now)}
            </p>
          )}
        </div>
      </div>
      <CardActions>
        <button type="button" disabled={busy} onClick={onRetry} className={SMALL_ACTION}>
          Try again
        </button>
        <Link to="/wish/$wishId" params={{ wishId: wish.id }} className={SMALL_ACTION}>
          Name it
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className={cn(SMALL_ACTION, 'border-transparent text-[var(--color-ink-muted)]')}
        >
          Delete
        </button>
      </CardActions>
    </article>
  );
}

function CardActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5 border-t-[0.5px] border-[var(--color-rule-soft)] px-3 py-2">
      {children}
    </div>
  );
}

function AddPlaceForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const createMut = useMutation({
    mutationFn: () => createWishItem({ kind: 'place', title: title.trim() }),
    onSuccess: (wish) => {
      // Show it at once, under "Just added"; the refetch confirms it.
      qc.setQueryData<WishItem[]>(ACTIVE_KEY, (list) =>
        list ? [wish, ...list.filter((w) => w.id !== wish.id)] : list,
      );
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
      className="space-y-2 rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] p-3"
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Where do you want to go?"
          aria-label="Place name"
          className="min-w-0 flex-1 rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper)] px-3 py-2 font-display text-[14px] outline-none placeholder:font-mono placeholder:text-[11px] placeholder:text-[var(--color-ink-faint)]"
        />
        <button
          type="submit"
          disabled={!title.trim() || createMut.isPending}
          className="shrink-0 rounded-[10px] bg-[var(--color-ink)] px-4 font-display text-[13px] font-medium text-[var(--color-paper)] disabled:opacity-50"
        >
          {createMut.isPending ? 'Saving…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onDone}
          aria-label="Cancel"
          className="shrink-0 px-1 text-[16px] leading-none text-[var(--color-ink-muted)]"
        >
          ×
        </button>
      </div>
      {createMut.isError && (
        <p className="text-xs text-[var(--color-stamp)]">{wishProblemMessage(createMut.error)}</p>
      )}
    </form>
  );
}

/**
 * Captures that left Places because their reading found a thing to buy,
 * not a place. A capture is filed under Places until it is read, so
 * without this it would just vanish from the list. Watched: the captures
 * saved from this tab, and any card seen here while it was being read.
 */
function useWatchForThings(wishes: WishItem[]) {
  const qc = useQueryClient();
  const watched = useWatchedCaptures();
  // Ids already being looked up, so a refetch does not ask twice.
  const asking = useRef(new Set<string>());
  useEffect(() => {
    for (const w of wishes) if (isReading(w)) watchCapture(w.id);
  }, [wishes]);
  useEffect(() => {
    const here = new Map(wishes.map((w) => [w.id, w]));
    for (const id of watched) {
      const w = here.get(id);
      if (w) {
        // Still here and read: it is a place, nothing to say.
        if (!isReading(w)) unwatchCapture(id);
        continue;
      }
      if (asking.current.has(id)) continue;
      asking.current.add(id);
      getWishItem(id)
        .then((found) => {
          // Saved after this list was fetched: fetch it again, which
          // brings the card in and keeps the list polling.
          if (isReading(found)) {
            void qc.invalidateQueries({ queryKey: ACTIVE_KEY });
            return;
          }
          unwatchCapture(id);
          if (found.kind === 'thing' && found.status === 'active') noteMovedToThings(found);
        })
        .catch(() => unwatchCapture(id)) // deleted
        .finally(() => asking.current.delete(id));
    }
  }, [wishes, watched, qc]);
}

/** Where the captures read as things went, with a way there. */
function MovedToThings({
  wishes,
  onDismiss,
}: {
  wishes: readonly WishItem[];
  onDismiss: () => void;
}) {
  const one = wishes.length === 1 ? wishes[0] : null;
  const unread = wishes.filter(isFailed).length;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] px-3.5 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-accent)]">
          {unread === wishes.length ? 'not read · moved to things' : 'saved under things'}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-[var(--color-ink-soft)] [overflow-wrap:anywhere]">
          {one && isFailed(one) ? (
            <>
              {captureFailureMessage(one)}, so it is not a place. It is under Things: name it
              there, or have it read again.
            </>
          ) : one ? (
            <>
              The screenshot shows a thing to buy, not a place:{' '}
              <span className="font-display font-medium text-[var(--color-ink)]">{one.title}</span>.
            </>
          ) : unread === wishes.length ? (
            `${wishes.length} images could not be read, so they are not places. They are under Things.`
          ) : unread > 0 ? (
            `${wishes.length} screenshots are under Things now: ${wishes.length - unread} read as things to buy, ${unread} not read.`
          ) : (
            `${wishes.length} screenshots show things to buy, not places.`
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {one && (
            <Link to="/wish/$wishId" params={{ wishId: one.id }} className={SMALL_ACTION}>
              Open it
            </Link>
          )}
          <Link to="/wish" search={{ section: 'things' }} className={SMALL_ACTION}>
            Go to Things →
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 px-1 text-[16px] leading-none text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        ×
      </button>
    </div>
  );
}
