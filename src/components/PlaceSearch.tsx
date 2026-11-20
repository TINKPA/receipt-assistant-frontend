import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchWishPlaces, type WishPlaceCandidate } from '../lib/api/things';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { humanizePlaceType, wishProblemMessage } from '../lib/wishPlaces';
import { cn } from '../lib/utils';

const SMALL_ACTION =
  'rounded-full border-[0.5px] border-[var(--color-rule)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-50';

/**
 * Find a wish's place on Google and pick it. What is in the box is what is
 * searched: the caller prefills it (the title, and the area when one is
 * known), and the person can change any of it.
 *
 * `picking` is the google_place_id being saved, so its row can say so;
 * `pickError` is why the last pick failed.
 */
export function PlaceSearch({
  initialQuery,
  currentGooglePlaceId,
  picking,
  pickError,
  onPick,
  onRemove,
  onClose,
}: {
  initialQuery: string;
  currentGooglePlaceId: string | null;
  picking: string | null;
  pickError: string | null;
  onPick: (candidate: WishPlaceCandidate) => void;
  /** "Remove match"; absent when there is no match to remove. */
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const query = useDebouncedValue(q.trim(), 400);
  const typing = q.trim() !== query;
  const busy = picking !== null;
  // It opens from a button low on a long page: bring it up to where the
  // results have room above the tab bar and the keyboard.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const { data, isFetching, error } = useQuery({
    queryKey: ['wish-place-search', query],
    queryFn: () => searchWishPlaces(query),
    enabled: query !== '',
    staleTime: 5 * 60_000,
    retry: false,
  });

  let body;
  if (query === '') {
    body = <Note>Type the place's name, and the area if you know it.</Note>;
  } else if (typing || (isFetching && !data)) {
    body = (
      <Note>
        <span className="animate-pulse">Searching…</span>
      </Note>
    );
  } else if (error) {
    body = <Note tone="error">{wishProblemMessage(error)}</Note>;
  } else if (!data || data.length === 0) {
    body = <Note>No places found for “{query}”. Try another spelling, or add the city.</Note>;
  } else {
    body = (
      <ul
        className={cn(
          'divide-y divide-[var(--color-rule-soft)]',
          isFetching && 'opacity-60 transition-opacity',
        )}
      >
        {data.map((c) => {
          const current = c.google_place_id === currentGooglePlaceId;
          const type = humanizePlaceType(c.primary_type);
          return (
            <li key={c.google_place_id}>
              <button
                type="button"
                disabled={busy || current}
                onClick={() => onPick(c)}
                className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--color-paper)] disabled:hover:bg-transparent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[14.5px] font-medium leading-tight">
                    {c.name ?? 'Unnamed place'}
                  </span>
                  {c.formatted_address && (
                    <span className="mt-0.5 block text-[12px] leading-snug text-[var(--color-ink-soft)]">
                      {c.formatted_address}
                    </span>
                  )}
                  {(type || c.rating != null) && (
                    <span className="mt-0.5 block font-mono text-[9.5px] text-[var(--color-ink-muted)]">
                      {type}
                      {type && c.rating != null && ' · '}
                      {c.rating != null && (
                        <span className="text-[var(--color-amber)]">
                          ★ {c.rating.toFixed(1)}
                          {c.user_rating_count != null &&
                            ` (${c.user_rating_count.toLocaleString('en-US')})`}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span className="shrink-0 self-center font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-accent)]">
                  {current ? 'current' : picking === c.google_place_id ? 'saving…' : 'pick'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div
      ref={boxRef}
      className="scroll-mt-4 overflow-hidden rounded-[13px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)]"
    >
      <div className="flex items-center gap-2 border-b-[0.5px] border-[var(--color-rule-soft)] p-2.5">
        {/* type=search for the keyboard's search key; the browser's own
            clear × is hidden, so the × beside the box (close) is the only
            one. */}
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name and area"
          aria-label="Search for the place"
          enterKeyHint="search"
          className="min-w-0 flex-1 rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper)] px-3 py-2 font-display text-[14px] outline-none placeholder:font-mono placeholder:text-[11px] placeholder:text-[var(--color-ink-faint)] [&::-webkit-search-cancel-button]:appearance-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the search"
          className="shrink-0 px-1.5 text-[18px] leading-none text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>
      {body}
      {pickError && (
        <p className="border-t-[0.5px] border-[var(--color-rule-soft)] px-3.5 py-2 text-[12px] text-[var(--color-stamp)]">
          {pickError}
        </p>
      )}
      {onRemove && (
        <div className="flex items-center justify-between gap-3 border-t-[0.5px] border-[var(--color-rule-soft)] px-3.5 py-2.5">
          <span className="text-[11.5px] leading-snug text-[var(--color-ink-muted)]">
            Not on the map at all?
          </span>
          <button type="button" disabled={busy} onClick={onRemove} className={SMALL_ACTION}>
            Remove match
          </button>
        </div>
      )}
    </div>
  );
}

function Note({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <p
      className={cn(
        'px-3.5 py-4 text-center text-[12.5px] leading-snug',
        tone === 'error' ? 'text-[var(--color-stamp)]' : 'text-[var(--color-ink-muted)]',
      )}
    >
      {children}
    </p>
  );
}
