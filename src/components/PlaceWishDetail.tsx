import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  deleteWishItem,
  getWishItem,
  patchWishItem,
  retryWishCapture,
  type UpdateWishItemRequest,
  type WishItem,
} from '../lib/api/things';
import {
  googleMapsLink,
  humanizePlaceType,
  isFailed,
  closedTogether,
  isReading,
  latestVisit,
  placeSearchPrefill,
  wishSearchArea,
  suggestionReason,
  titleSetByUser,
  wishAltName,
  wishCategory,
  wishClosure,
  wishDetailKey,
  wishProblemMessage,
  wishReading,
} from '../lib/wishPlaces';
import { useBack } from '../lib/useBack';
import { failedAgain, noteRetry, useRetries } from '../lib/wishSession';
import { useNow } from '../lib/useNow';
import { cn } from '../lib/utils';
import { PlaceSearch } from './PlaceSearch';
import { NotReadBanner, ReadAgainRow, ReadingNotice } from './WishCapture';
import { WishClosureCard } from './WishClosure';
import { WishHeroImage } from './WishImage';
import { TextField } from './WishFields';

const LABEL = 'font-mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]';
const CARD =
  'rounded-[13px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-3.5 py-3';
const SMALL_ACTION =
  'rounded-full border-[0.5px] border-[var(--color-rule)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-50';

/**
 * /wish/$id for a place: the image it was saved from, what the reading
 * found, the place it was matched to, and whether you have been.
 */
export function PlaceWishDetail({ wish }: { wish: WishItem }) {
  const back = useBack('/wish');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  // The place search is open (from "Wrong place" or "Find on map").
  const [searching, setSearching] = useState(false);
  // Read again here or on the list: a reading that fails again says so.
  const retries = useRetries();
  const now = useNow();

  const onError = (e: unknown) => setErr(wishProblemMessage(e));
  const refresh = () => qc.invalidateQueries({ queryKey: ['wish-items'] });
  // PATCH and retry answer with the whole wish; show it without waiting
  // for the refetch (and, after a retry, start polling at once).
  const show = (next: WishItem) => {
    qc.setQueryData(wishDetailKey(wish.id), next);
    void refresh();
  };

  // The other wishes for this place (the list folds the active ones into
  // one card). Loaded here so "Been there" can say how many it closes.
  const sameIds = wish.same_place_wish_ids;
  const others = useQueries({
    queries: sameIds.map((id) => ({
      queryKey: wishDetailKey(id),
      queryFn: () => getWishItem(id),
      retry: false,
    })),
  });
  const otherWishes = others.map((q) => q.data);
  const activeOthers = otherWishes.filter((o): o is WishItem => o?.status === 'active');
  // An earlier save of this place that a visit closed: this one is a wish
  // to go back.
  const before = latestVisit(otherWishes);
  // The saves this one was marked visited with ("Been there" moves them
  // all): "Want again" puts them back too.
  const together = closedTogether(wish, otherWishes);

  const patchMut = useMutation({
    mutationFn: (body: UpdateWishItemRequest) => patchWishItem(wish.id, body),
    onMutate: () => setErr(null),
    onSuccess: show,
    onError,
  });
  // "Been there" is about the place, not the one screenshot: like the
  // folded card on the list (and a receipt from the place), it closes
  // every active wish for it. The others are read again first, so one
  // that changed since this page loaded is not reopened or closed twice.
  const visitMut = useMutation({
    mutationFn: async () => {
      const next = await patchWishItem(wish.id, { status: 'converted' });
      const fresh = await Promise.all(sameIds.map((id) => getWishItem(id)));
      const closed = await Promise.all(
        fresh
          .filter((o) => o.status === 'active')
          .map((o) => patchWishItem(o.id, { status: 'converted' })),
      );
      for (const o of closed) qc.setQueryData(wishDetailKey(o.id), o);
      return next;
    },
    onMutate: () => setErr(null),
    onSuccess: show,
    // The first PATCH may have gone through: refetch so the page says
    // what is true now.
    onError: (e) => {
      onError(e);
      void refresh();
    },
  });
  // "Want again" undoes what "Been there" did: this wish and the saves
  // closed together with it go back on the list. Those are read again
  // first, so one that changed since this page loaded is left alone.
  const wantAgainMut = useMutation({
    mutationFn: async () => {
      const fresh = await Promise.all(together.map((o) => getWishItem(o.id)));
      const next = await patchWishItem(wish.id, { status: 'active' });
      const reopened = await Promise.all(
        fresh
          .filter((o) => closedTogether(wish, [o]).length > 0)
          .map((o) => patchWishItem(o.id, { status: 'active' })),
      );
      for (const o of reopened) qc.setQueryData(wishDetailKey(o.id), o);
      return next;
    },
    onMutate: () => setErr(null),
    onSuccess: show,
    onError: (e) => {
      onError(e);
      void refresh();
    },
  });
  // A place picked in the search, or the match removed. Its failure is
  // shown inside the search, which stays open for another try.
  const placeMut = useMutation({
    mutationFn: (body: UpdateWishItemRequest) => patchWishItem(wish.id, body),
    onSuccess: (next) => {
      setSearching(false);
      show(next);
    },
  });
  // After a place is picked, a name that came from the image, or that is
  // just the old place's name, follows the new place (the heading and the
  // place card would disagree otherwise). A name the person gave it stays,
  // and they are offered the place's.
  const [offerName, setOfferName] = useState<string | null>(null);
  const pickPlace = (googlePlaceId: string, name: string | null) => {
    setOfferName(null);
    const title = wish.title.trim();
    const differs = name !== null && name.trim() !== title;
    const follow = differs && (!titleSetByUser(wish) || title === wish.place?.name?.trim());
    placeMut.mutate(
      { google_place_id: googlePlaceId, ...(follow ? { title: name } : {}) },
      { onSuccess: () => setOfferName(differs && !follow ? name : null) },
    );
  };
  const retryMut = useMutation({
    mutationFn: () => retryWishCapture(wish.id),
    onMutate: () => setErr(null),
    onSuccess: (next) => {
      noteRetry(next);
      show(next);
    },
    onError,
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteWishItem(wish.id),
    onMutate: () => setErr(null),
    onSuccess: () => {
      qc.removeQueries({ queryKey: wishDetailKey(wish.id) });
      void refresh();
      void navigate({ to: '/wish', search: { section: 'places' } });
    },
    onError,
  });

  const reading = wishReading(wish);
  const readingNow = isReading(wish);
  const unread = isFailed(wish);
  const visited = wish.status === 'converted';
  const closure = wishClosure(wish);
  const alt = wishAltName(wish);
  const category = wishCategory(wish);
  const place = wish.place;
  // A guessed place waits for a yes or a no; a linked place has none.
  const suggestion = place ? null : wish.place_suggestion;
  const sourceUrl = wish.source_url ?? reading?.sourceUrl ?? null;
  const busy =
    patchMut.isPending ||
    visitMut.isPending ||
    wantAgainMut.isPending ||
    placeMut.isPending ||
    retryMut.isPending ||
    deleteMut.isPending;

  // The search starts from the name and, when one is known, the area: the
  // area the image named, else the matched place's (the place's first when
  // the person picked it by hand).
  const area = wishSearchArea(wish);
  const searchQuery = placeSearchPrefill(unread ? '' : wish.title, area);
  const openSearch = () => {
    placeMut.reset();
    setSearching(true);
  };

  return (
    <div className="mx-auto max-w-[560px] space-y-4">
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={back}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          ← Wanting
        </button>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          place · {visited ? 'visited' : `saved ${wish.created_at.slice(0, 10)}`}
        </span>
      </div>

      {wish.has_image && (
        <WishHeroImage
          wish={wish}
          alt="The image this place was saved from"
          pulsing={readingNow}
        />
      )}

      {readingNow ? (
        <ReadingNotice wish={wish} />
      ) : (
        <div className="space-y-3">
          {unread && (
            <NotReadBanner
              wish={wish}
              now={now}
              retried={failedAgain(wish, retries)}
              hint="Type its name below, or have it read again."
            />
          )}

          <div>
            <TextField
              // Remount when the server's value changes (a reading that
              // just finished, a retry) so the field shows it.
              key={`title:${wish.title}`}
              label="Name"
              value={unread ? '' : wish.title}
              placeholder="Name this place"
              disabled={busy}
              required
              // An image that could not be read: the page is there to
              // name it ("Name it" on the list lands here).
              autoFocus={unread}
              onSave={(title) => {
                setOfferName(null);
                if (title) patchMut.mutate({ title });
              }}
              className="font-display text-[22px] font-medium leading-tight tracking-tight"
            />
            {offerName && offerName.trim() !== wish.title.trim() && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-snug text-[var(--color-ink-muted)]">
                <span className="min-w-0 break-words">
                  The place is called{' '}
                  <span className="text-[var(--color-ink-soft)]">{offerName}</span>.
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    patchMut.mutate({ title: offerName }, { onSuccess: () => setOfferName(null) })
                  }
                  className={SMALL_ACTION}
                >
                  Use that name
                </button>
                <button
                  type="button"
                  onClick={() => setOfferName(null)}
                  className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  Keep mine
                </button>
              </p>
            )}
            {(alt || category || place?.rating != null) && (
              <p className="mt-1.5 break-words text-[12.5px] text-[var(--color-ink-muted)]">
                {[
                  alt && (
                    <span key="alt" className="font-display text-[14px] text-[var(--color-ink-soft)]">
                      {alt}
                    </span>
                  ),
                  category && <span key="category">{category}</span>,
                  place?.rating != null && (
                    <span key="rating" className="text-[var(--color-amber)]">
                      ★ {place.rating.toFixed(1)}
                    </span>
                  ),
                ]
                  .filter(Boolean)
                  .flatMap((part, i) => (i === 0 ? [part] : [' · ', part]))}
              </p>
            )}
          </div>

          <TextField
            key={`notes:${wish.notes ?? ''}`}
            label="Notes"
            value={wish.notes ?? ''}
            placeholder="What do you want to remember about it?"
            disabled={busy}
            multiline
            onSave={(notes) => patchMut.mutate({ notes })}
            className="text-[13.5px] leading-snug text-[var(--color-ink-soft)]"
          />
        </div>
      )}

      {/* Saved again after a visit: say so near the top, not only in the
          "Also saved" rows further down. */}
      {!visited && !readingNow && before && (
        <Section label="Been here before">
          <WishClosureCard closure={before.closure} kind="place" className={CARD} />
        </Section>
      )}

      {err && <p className="text-center text-xs text-[var(--color-stamp)]">{err}</p>}

      {closure && (
        <Section label="Visited">
          <WishClosureCard closure={closure} kind="place" className={CARD} />
        </Section>
      )}

      {!readingNow && (
        <Section label="The place">
          {searching ? (
            <PlaceSearch
              initialQuery={searchQuery}
              currentGooglePlaceId={place?.google_place_id ?? null}
              picking={
                placeMut.isPending ? (placeMut.variables.google_place_id ?? null) : null
              }
              pickError={placeMut.error ? wishProblemMessage(placeMut.error) : null}
              onPick={(c) => pickPlace(c.google_place_id, c.name ?? null)}
              onRemove={place ? () => placeMut.mutate({ place_id: null }) : undefined}
              onClose={() => setSearching(false)}
            />
          ) : place ? (
            <div className={CARD}>
              <p className="font-display text-[15px] font-medium leading-tight">
                {place.name ?? wish.title}
                {place.name_zh && place.name_zh !== place.name && (
                  <span className="ml-1.5 text-[13px] font-normal text-[var(--color-ink-muted)]">
                    {place.name_zh}
                  </span>
                )}
              </p>
              {place.formatted_address && (
                <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
                  {place.formatted_address}
                </p>
              )}
              <p className="mt-1 font-mono text-[9.5px] text-[var(--color-ink-muted)]">
                {[humanizePlaceType(place.primary_type), place.neighborhood ?? place.locality]
                  .filter(Boolean)
                  .join(' · ')}
                {place.rating != null && (
                  <span className="text-[var(--color-amber)]"> · ★ {place.rating.toFixed(1)}</span>
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                {place.google_maps_uri ? (
                  <a
                    href={place.google_maps_uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-paper)]"
                  >
                    Open in Maps ↗
                  </a>
                ) : (
                  <span />
                )}
                <button type="button" disabled={busy} onClick={openSearch} className={SMALL_ACTION}>
                  Wrong place
                </button>
              </div>
            </div>
          ) : suggestion ? (
            <div className={cn(CARD, 'border-[color:rgba(181,52,26,0.35)]')}>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-accent)]">
                is it this place?
              </p>
              <p className="mt-1 font-display text-[15px] font-medium leading-tight">
                {suggestion.name ?? 'A place on the map'}
              </p>
              {suggestion.formatted_address && (
                <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
                  {suggestion.formatted_address}
                </p>
              )}
              <p className="mt-1.5 text-[12px] leading-snug text-[var(--color-ink-muted)]">
                {suggestionReason(suggestion, reading?.address ?? null)} Not linked until you say
                so.
              </p>
              {placeMut.error && (
                <p className="mt-1.5 text-xs text-[var(--color-stamp)]">
                  {wishProblemMessage(placeMut.error)}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <a
                  href={googleMapsLink(suggestion.google_place_id, suggestion.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-accent)] hover:underline"
                >
                  Look at it ↗
                </a>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => placeMut.mutate({ place_id: null })}
                    className={SMALL_ACTION}
                  >
                    {placeMut.isPending && placeMut.variables.place_id === null ? 'Saving…' : 'Not it'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={openSearch}
                    className={SMALL_ACTION}
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pickPlace(suggestion.google_place_id, suggestion.name ?? null)}
                    className="rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-paper)] disabled:opacity-50"
                  >
                    {placeMut.isPending && placeMut.variables.google_place_id ? 'Saving…' : 'Yes, this one'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={cn(CARD, 'border-dashed')}>
              <p className="text-[12.5px] leading-snug text-[var(--color-ink-muted)]">
                Not matched to a place on the map.
                {reading?.address ? ` The image says: ${reading.address}.` : ''}
              </p>
              <div className="mt-2.5 flex justify-end">
                <button type="button" disabled={busy} onClick={openSearch} className={SMALL_ACTION}>
                  Find on map
                </button>
              </div>
            </div>
          )}
        </Section>
      )}

      {reading && reading.highlights.length > 0 && (
        <Section label="What to get">
          <ul className={cn(CARD, 'space-y-1.5')}>
            {reading.highlights.map((h) => (
              <li key={h} className="flex gap-2 text-[13px] leading-snug text-[var(--color-ink-soft)]">
                <span aria-hidden="true" className="text-[var(--color-accent)]">·</span>
                <span className="min-w-0 break-words">{h}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(reading?.recommendedBy || reading?.sourceApp || sourceUrl) && (
        <Section label="Where it came from">
          <dl className={cn(CARD, 'space-y-1.5 text-[12.5px] leading-snug')}>
            {reading?.recommendedBy && <Fact term="Recommended by">{reading.recommendedBy}</Fact>}
            {reading?.sourceApp && <Fact term="Seen on">{reading.sourceApp}</Fact>}
            {sourceUrl && (
              <Fact term="Link">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[var(--color-accent)] underline-offset-2 hover:underline"
                >
                  {sourceUrl}
                </a>
              </Fact>
            )}
          </dl>
        </Section>
      )}

      {sameIds.length > 0 && <SamePlaceWishes ids={sameIds} others={otherWishes} />}

      {wish.has_image && !readingNow && (
        <ReadAgainRow
          wish={wish}
          busy={busy}
          starting={retryMut.isPending}
          onRetry={() => retryMut.mutate()}
        />
      )}

      <div className="space-y-2 pb-4">
        {!readingNow && !unread && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              visited ? wantAgainMut.mutate() : visitMut.mutate()
            }
            className={cn(
              'block w-full rounded-[14px] py-3.5 text-center font-display text-[15px] font-medium disabled:opacity-60',
              visited
                ? 'border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]'
                : 'bg-[var(--color-ink)] text-[var(--color-paper)]',
            )}
          >
            {visited ? 'Want again' : 'Been there'}
            <span
              className={cn(
                'block font-mono text-[8.5px] uppercase tracking-[0.12em]',
                visited ? 'text-[var(--color-ink-muted)]' : 'text-[var(--color-paper-fold)]',
              )}
            >
              {visited
                ? together.length > 0
                  ? `puts it and the ${together.length} ${together.length === 1 ? 'save' : 'saves'} marked with it back on the list`
                  : 'puts it back on the list'
                : activeOthers.length > 0
                  ? `moves it and ${activeOthers.length} other ${activeOthers.length === 1 ? 'save' : 'saves'} to visited`
                  : 'moves it to visited'}
            </span>
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => deleteMut.mutate()}
          className="block w-full py-1 text-center font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
        >
          delete outright
        </button>
      </div>
    </div>
  );
}

/**
 * The other wishes for the same place: the same restaurant saved from
 * another screenshot, or typed in again. The list shows them as one card;
 * this is where each can still be opened.
 */
function SamePlaceWishes({
  ids,
  others,
}: {
  ids: string[];
  /** The wish behind each id, in the same order; undefined while loading. */
  others: (WishItem | undefined)[];
}) {
  return (
    <Section label={`Also saved · ${ids.length}`}>
      <ul className="divide-y divide-[var(--color-rule-soft)] rounded-[13px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)]">
        {ids.map((id, i) => {
          const other = others[i];
          const state = !other
            ? ''
            : other.status === 'converted'
              ? 'visited'
              : other.status === 'declined'
                ? 'declined'
                : `saved ${other.created_at.slice(0, 10)}`;
          return (
            <li key={id}>
              <Link
                to="/wish/$wishId"
                params={{ wishId: id }}
                className="flex items-baseline justify-between gap-3 px-3.5 py-2.5 hover:bg-[var(--color-paper)]"
              >
                <span className="min-w-0 truncate text-[13px] text-[var(--color-ink-soft)]">
                  {other ? other.title : '…'}
                  {other?.notes && (
                    <span className="text-[var(--color-ink-muted)]"> · {other.notes}</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-[var(--color-ink-muted)]">
                  {state} <span className="text-[var(--color-accent)]">→</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className={LABEL}>{label}</h2>
      {children}
    </section>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[92px] shrink-0 font-mono text-[8.5px] uppercase leading-[1.7] tracking-[0.1em] text-[var(--color-ink-muted)]">
        {term}
      </dt>
      <dd className="min-w-0 flex-1 text-[var(--color-ink-soft)]">{children}</dd>
    </div>
  );
}
