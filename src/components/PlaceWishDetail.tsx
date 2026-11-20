import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteWishItem,
  patchWishItem,
  retryWishCapture,
  wishImageUrl,
  type UpdateWishItemRequest,
  type WishItem,
} from '../lib/api/things';
import {
  captureFailureMessage,
  humanizePlaceType,
  isFailed,
  isReading,
  isUnreadCapture,
  wishAltName,
  wishCategory,
  wishDetailKey,
  wishProblemMessage,
  wishReading,
} from '../lib/wishPlaces';
import { useBack } from '../lib/useBack';
import { cn } from '../lib/utils';

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

  const onError = (e: unknown) => setErr(wishProblemMessage(e));
  const refresh = () => qc.invalidateQueries({ queryKey: ['wish-items'] });
  // PATCH and retry answer with the whole wish; show it without waiting
  // for the refetch (and, after a retry, start polling at once).
  const show = (next: WishItem) => {
    qc.setQueryData(wishDetailKey(wish.id), next);
    void refresh();
  };

  const patchMut = useMutation({
    mutationFn: (body: UpdateWishItemRequest) => patchWishItem(wish.id, body),
    onMutate: () => setErr(null),
    onSuccess: show,
    onError,
  });
  const retryMut = useMutation({
    mutationFn: () => retryWishCapture(wish.id),
    onMutate: () => setErr(null),
    onSuccess: show,
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
  const unread = isUnreadCapture(wish);
  const visited = wish.status === 'converted';
  const alt = wishAltName(wish);
  const category = wishCategory(wish);
  const place = wish.place;
  const sourceUrl = wish.source_url ?? reading?.sourceUrl ?? null;
  const busy = patchMut.isPending || retryMut.isPending || deleteMut.isPending;

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
        <a
          href={wishImageUrl(wish.id)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the captured image full size"
          className="relative block overflow-hidden rounded-[18px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)]"
        >
          <img
            src={wishImageUrl(wish.id)}
            alt="The image this place was saved from"
            className={cn(
              'mx-auto max-h-[56vh] w-auto max-w-full object-contain',
              readingNow && 'animate-pulse',
            )}
          />
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-[color:rgba(251,247,238,0.92)] px-2.5 py-1 font-mono text-[8.5px] text-[var(--color-ink-soft)]">
            full size ↗
          </span>
        </a>
      )}

      {readingNow ? (
        <div aria-busy="true">
          <h1 className="font-display text-[22px] font-medium italic leading-tight text-[var(--color-ink-muted)]">
            Reading…
          </h1>
          <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink-muted)]">
            Working out what this is and where. It usually takes under a minute; this page fills in
            by itself.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {isFailed(wish) && (
            <div className={cn(CARD, 'border-[color:rgba(139,38,19,0.35)]')}>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-stamp)]">
                not read
              </p>
              <p className="mt-1 text-[13px] leading-snug text-[var(--color-ink-soft)]">
                {captureFailureMessage(wish)}.{' '}
                {unread ? 'Type its name below, or have it read again.' : ''}
              </p>
            </div>
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
              onSave={(title) => {
                if (title) patchMut.mutate({ title });
              }}
              className="font-display text-[22px] font-medium leading-tight tracking-tight"
            />
            {(alt || category || place?.rating != null) && (
              <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-muted)]">
                {alt && <span className="mr-2 font-display text-[14px] text-[var(--color-ink-soft)]">{alt}</span>}
                {category}
                {category && place?.rating != null && ' · '}
                {place?.rating != null && (
                  <span className="text-[var(--color-amber)]">★ {place.rating.toFixed(1)}</span>
                )}
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

      {err && <p className="text-center text-xs text-[var(--color-stamp)]">{err}</p>}

      {!readingNow && (
        <Section label="The place">
          {place ? (
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
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patchMut.mutate({ place_id: null })}
                  className={SMALL_ACTION}
                >
                  Wrong place
                </button>
              </div>
            </div>
          ) : (
            <p className={cn(CARD, 'border-dashed text-[12.5px] leading-snug text-[var(--color-ink-muted)]')}>
              Not matched to a place on the map.
              {reading?.address ? ` The image says: ${reading.address}.` : ''}
              {wish.has_image ? ' Reading the image again looks for it again.' : ''}
            </p>
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

      {wish.has_image && !readingNow && (
        <div className="flex items-center justify-between gap-3 px-0.5">
          <p className="font-mono text-[9px] text-[var(--color-ink-muted)]">
            {isFailed(wish) ? 'The image was not read.' : 'Read from the image.'}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => retryMut.mutate()}
            className={SMALL_ACTION}
          >
            {retryMut.isPending ? 'Starting…' : 'Read again'}
          </button>
        </div>
      )}

      <div className="space-y-2 pb-4">
        {!readingNow && !unread && (
          <button
            type="button"
            disabled={busy}
            onClick={() => patchMut.mutate({ status: visited ? 'active' : 'converted' })}
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
              {visited ? 'puts it back on the list' : 'moves it to visited'}
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

/** Text the user types; saved on blur (and on Enter for a single line),
 *  as the money fields on the owned page are. An empty notes field clears
 *  the note; an empty required field is put back as it was. */
function TextField({
  label,
  value,
  placeholder,
  disabled,
  multiline,
  required,
  onSave,
  className,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  multiline?: boolean;
  required?: boolean;
  onSave: (next: string | null) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const commit = () => {
    const next = text.trim();
    if (next === value.trim()) return;
    if (next === '' && required) {
      setText(value);
      return;
    }
    onSave(next === '' ? null : next);
  };
  const shared = {
    value: text,
    placeholder,
    disabled,
    'aria-label': label,
    onBlur: commit,
    className: cn(
      'w-full min-w-0 rounded-none border-b-[0.5px] border-transparent bg-transparent pb-0.5 outline-none transition-colors placeholder:text-[var(--color-ink-faint)] hover:border-[var(--color-rule)] focus:border-[var(--color-ink-muted)]',
      className,
    ),
  };
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {multiline ? (
        <textarea
          {...shared}
          rows={Math.min(6, Math.max(2, Math.ceil(text.length / 44)))}
          onChange={(e) => setText(e.target.value)}
          className={cn(shared.className, 'mt-1 block resize-none')}
        />
      ) : (
        <input
          {...shared}
          type="text"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className={cn(shared.className, 'mt-1 block')}
        />
      )}
    </label>
  );
}
