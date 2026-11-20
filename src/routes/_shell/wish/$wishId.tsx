import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  deleteWishItem,
  getWishItem,
  listOwnedItemsExpanded,
  patchWishItem,
  retryWishCapture,
  type UpdateWishItemRequest,
  type WishItem,
} from '../../../lib/api/things';
import { WishClosureCard } from '../../../components/WishClosure';
import { WishHeroImage } from '../../../components/WishImage';
import {
  wishPerDay,
  perDay,
  isSnoozed,
  fmtPrice,
  fmtYears,
  yearsToDays,
  dollarsToMinor,
} from '../../../lib/things';
import {
  isFailed,
  isReading,
  unreadDescription,
  wishClosure,
  wishDetailKey,
  wishProblemMessage,
} from '../../../lib/wishPlaces';
import { NumberField, TextField } from '../../../components/WishFields';
import { PlaceWishDetail } from '../../../components/PlaceWishDetail';
import { NotReadBanner, ReadAgainRow, ReadingNotice } from '../../../components/WishCapture';
import { useBack } from '../../../lib/useBack';
import { failedAgain, noteRetry, useRetries } from '../../../lib/wishSession';
import { useNow } from '../../../lib/useNow';
import { cn } from '../../../lib/utils';

// `?notice=already-saved`: arrived from a capture of an image this wish
// was already saved from. The notice is taken out of the URL at once (a
// reload, or Back to this page, uploaded nothing) and kept on screen for a
// few seconds by the page itself.
const wishDetailSearch = z.object({
  notice: z.enum(['already-saved']).optional().catch(undefined),
});

export const Route = createFileRoute('/_shell/wish/$wishId')({
  validateSearch: wishDetailSearch,
  component: WishDetailRoute,
});

/**
 * /wish/$id — one wish. A place to go to and a thing to buy share the
 * route and nothing else, so the kind picks the page.
 */
function WishDetailRoute() {
  const { wishId } = Route.useParams();
  // Read by id, not out of the active list: a visited place is still a
  // page (it is where "Want again" lives). A wish whose image is still
  // being read is polled until the server has filled it in.
  const { data: wish, isLoading } = useQuery({
    queryKey: wishDetailKey(wishId),
    queryFn: () => getWishItem(wishId),
    retry: false,
    refetchInterval: (query) => (query.state.data && isReading(query.state.data) ? 3000 : false),
  });

  if (isLoading) {
    return (
      <p className="py-16 text-center font-display italic text-[var(--color-ink-muted)]">
        loading…
      </p>
    );
  }
  if (!wish) {
    return (
      <div className="py-16 text-center">
        <p className="font-display italic text-[var(--color-ink-muted)]">
          Wish not found (it may have been deleted).
        </p>
        <Link
          to="/wish"
          className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          ← Wanting
        </Link>
      </div>
    );
  }
  // A capture is a place until its reading says otherwise, so one that is
  // still being read, or that failed, lands on the place page too.
  return (
    <>
      <AlreadySavedNotice wish={wish} />
      {wish.kind === 'place' ? <PlaceWishDetail wish={wish} /> : <ThingWishDetail wish={wish} />}
    </>
  );
}

const NOTICE_MS = 6000;

function AlreadySavedNotice({ wish }: { wish: WishItem }) {
  const { notice } = Route.useSearch();
  const navigate = Route.useNavigate();
  // Taken from the URL on the first render, then held here.
  const [shown, setShown] = useState(notice === 'already-saved');
  useEffect(() => {
    if (!notice) return;
    void navigate({ search: {}, replace: true });
  }, [notice, navigate]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), NOTICE_MS);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  const where =
    wish.status === 'converted'
      ? wish.kind === 'place'
        ? 'you have been there since · this is that wish'
        : 'you have bought it since · this is that wish'
      : wish.status === 'declined'
        ? 'you declined it since · this is that wish'
        : 'here is that wish';
  return (
    <p
      role="status"
      className="mx-auto mb-1 max-w-[560px] rounded-[12px] bg-[var(--color-ink)] px-3.5 py-2.5 text-center font-display text-[13.5px] text-[var(--color-paper)]"
    >
      Already saved
      <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-paper-fold)]">
        this image was saved before · {where}
      </span>
    </p>
  );
}

/**
 * A thing to buy — projected cost + acquisition decision (board screen
 * 13): target ÷ planned days = projected $/day, framed against the current
 * portfolio daily. Convert / snooze 30d / decline.
 */
function ThingWishDetail({ wish }: { wish: WishItem }) {
  const wishId = wish.id;
  const back = useBack('/wish?section=things');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  // Read again here or on the list: a reading that fails again says so.
  const retries = useRetries();
  const now = useNow();

  const { data: owned = [] } = useQuery({
    queryKey: ['owned-items', 'expanded'],
    queryFn: () => listOwnedItemsExpanded({ include_retired: true }),
  });

  const ownedDaily = useMemo(
    () => owned.filter((i) => !i.retired_at).reduce((s, i) => s + (perDay(i) ?? 0), 0),
    [owned],
  );

  const patchMut = useMutation({
    mutationFn: (body: UpdateWishItemRequest) => patchWishItem(wishId, body),
    onMutate: () => setErr(null),
    // PATCH answers with the whole wish: show it now, then refetch.
    onSuccess: (next) => {
      qc.setQueryData(wishDetailKey(wishId), next);
      void qc.invalidateQueries({ queryKey: ['wish-items'] });
    },
    onError: (e: unknown) => setErr(wishProblemMessage(e)),
  });
  const retryMut = useMutation({
    mutationFn: () => retryWishCapture(wishId),
    onMutate: () => setErr(null),
    onSuccess: (next) => {
      noteRetry(next);
      qc.setQueryData(wishDetailKey(wishId), next);
      void qc.invalidateQueries({ queryKey: ['wish-items'] });
    },
    onError: (e: unknown) => setErr(wishProblemMessage(e)),
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteWishItem(wishId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wish-items'] });
      navigate({ to: '/wish', search: { section: 'things' } });
    },
  });

  const pd = wishPerDay(wish);
  const target = wish.target_price_minor != null ? wish.target_price_minor / 100 : null;
  const snoozed = isSnoozed(wish);
  const closure = wishClosure(wish);
  const readingNow = isReading(wish);
  const unread = isFailed(wish);
  const description = unreadDescription(wish);
  const busy = patchMut.isPending || retryMut.isPending;
  const badges = (
    <>
      <span className="absolute bottom-3 left-3 rounded-full bg-[color:rgba(251,247,238,0.92)] px-2.5 py-1 font-mono text-[8.5px] text-[var(--color-ink-soft)]">
        ● {snoozed ? `snoozed until ${wish.snoozed_until}` : wish.urgency} · saved{' '}
        {wish.created_at.slice(0, 10)}
      </span>
      <span className="absolute right-3 top-3 rounded-[4px] border border-[var(--color-ink-faint)] px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)] [transform:rotate(2deg)]">
        wish
      </span>
    </>
  );

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
          wish · acquisition planning
        </span>
      </div>

      {/* hero: the image it was captured from, else the placeholder */}
      {wish.has_image ? (
        <WishHeroImage wish={wish} alt="The image this wish was saved from" pulsing={readingNow}>
          {badges}
        </WishHeroImage>
      ) : (
        <div className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-[18px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)]">
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-[64px] text-[var(--color-ink-faint)]"
            style={{
              background:
                'repeating-linear-gradient(45deg, transparent 0 7px, rgba(140,130,115,0.07) 7px 9px)',
            }}
          >
            ◇
          </span>
          {badges}
        </div>
      )}

      {readingNow && <ReadingNotice wish={wish} />}
      {unread && (
        <NotReadBanner
          wish={wish}
          now={now}
          retried={failedAgain(wish, retries)}
          hint="Name it below, or have it read again."
        />
      )}

      <div className="space-y-3">
        {/* Not read: the title is a placeholder or the reading's
            description of the image, not a name, so the field starts
            empty and the description is shown under it as a hint. */}
        <div>
          <TextField
            key={`title:${unread}:${wish.title}`}
            label="Name"
            value={unread ? '' : wish.title}
            placeholder="What do you want?"
            disabled={busy}
            required
            autoFocus={unread}
            onSave={(title) => {
              if (title) patchMut.mutate({ title });
            }}
            className="font-display text-[22px] font-medium leading-tight tracking-tight"
          />
          {description && (
            <p className="mt-1.5 break-words text-[12.5px] leading-snug text-[var(--color-ink-muted)]">
              The image looked like: <span className="italic">{description}</span>
            </p>
          )}
        </div>
        <TextField
          key={`notes:${wish.notes ?? ''}`}
          label="Notes"
          value={wish.notes ?? ''}
          placeholder="What do you want to remember about it?"
          disabled={patchMut.isPending}
          multiline
          onSave={(notes) => patchMut.mutate({ notes })}
          className="text-[13.5px] leading-snug text-[var(--color-ink-soft)]"
        />
      </div>

      {/* the two numbers the projection is made of */}
      <div className="grid grid-cols-2 gap-3 rounded-[13px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-3.5 py-3">
        <NumberField
          key={`price:${wish.target_price_minor ?? ''}`}
          label="target price"
          prefix="$"
          value={wish.target_price_minor}
          disabled={patchMut.isPending}
          toText={(minor) => (minor / 100).toFixed(2)}
          fromText={dollarsToMinor}
          onSave={(minor) => patchMut.mutate({ target_price_minor: minor })}
        />
        <NumberField
          key={`days:${wish.planned_days ?? ''}`}
          label="planned use"
          suffix="years"
          value={wish.planned_days}
          disabled={patchMut.isPending}
          toText={fmtYears}
          fromText={yearsToDays}
          onSave={(days) => patchMut.mutate({ planned_days: days })}
        />
      </div>

      {/* projected cost */}
      <div>
        <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          PROJECTED DAILY COST
          {wish.planned_days ? ` · IF USED ${fmtYears(wish.planned_days)} YEARS` : ''}
        </p>
        <p className="mt-1 font-display text-[2.6rem] font-light leading-none tracking-tight tnum">
          {pd !== null ? `$${pd.toFixed(2)}` : '—'}
          <span className="ml-1 text-[15px] tracking-[0.06em] text-[var(--color-ink-soft)]">/day</span>
        </p>
        {pd === null && (
          <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
            {target === null && !wish.planned_days
              ? 'Fill in the price and how many years you would use it.'
              : target === null
                ? 'Fill in the price to see what it would cost a day.'
                : 'Fill in how many years you would use it to see what it would cost a day.'}
          </p>
        )}
        {pd !== null && ownedDaily > 0 && (
          <p className="mt-2 text-[12px] text-[var(--color-ink-soft)]">
            would push your portfolio from{' '}
            <strong className="font-mono text-[11px]">${ownedDaily.toFixed(2)}/d</strong> to{' '}
            <strong className="font-mono text-[11px]">${(ownedDaily + pd).toFixed(2)}/d</strong> —{' '}
            +{((pd / ownedDaily) * 100).toFixed(1)}%
          </p>
        )}
      </div>

      {/* calc row */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center rounded-[13px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-3 py-3 text-center">
        <Calc label="target" value={fmtPrice(wish.target_price_minor)} />
        <span className="font-display text-[15px] text-[var(--color-ink-faint)]">÷</span>
        <Calc
          label="days"
          value={wish.planned_days ? wish.planned_days.toLocaleString() : '—'}
        />
        <span className="font-display text-[15px] text-[var(--color-ink-faint)]">=</span>
        <Calc label="$/day" value={pd !== null ? `$${pd.toFixed(2)}` : '—'} accent />
      </div>

      {err && <p className="text-center text-xs text-[var(--color-stamp)]">{err}</p>}

      {wish.has_image && !readingNow && (
        <ReadAgainRow
          wish={wish}
          busy={busy}
          starting={retryMut.isPending}
          onRetry={() => retryMut.mutate()}
        />
      )}

      {closure && (
        <WishClosureCard
          closure={closure}
          kind="thing"
          className="rounded-[13px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-3.5 py-3"
        />
      )}

      {/* decision actions */}
      <div className="space-y-2 pb-4">
        {closure ? (
          <button
            type="button"
            disabled={patchMut.isPending}
            onClick={() => patchMut.mutate({ status: 'active' })}
            className="block w-full rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] py-3.5 text-center font-display text-[15px] font-medium text-[var(--color-ink-soft)]"
          >
            Want again
            <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
              puts it back on the list
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={patchMut.isPending}
            onClick={() =>
              patchMut.mutate(
                { status: 'converted' },
                { onSuccess: () => navigate({ to: '/wish', search: { section: 'things' } }) },
              )
            }
            className="block w-full rounded-[14px] bg-[var(--color-ink)] py-3.5 text-center font-display text-[15px] font-medium text-[var(--color-paper)]"
          >
            Convert to purchase
            <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-paper-fold)]">
              marks converted · link the transaction after it lands
            </span>
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={patchMut.isPending}
            onClick={() => {
              const until = new Date();
              until.setDate(until.getDate() + 30);
              patchMut.mutate({ snoozed_until: until.toISOString().slice(0, 10) });
            }}
            className="rounded-[12px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] py-2.5 font-display text-[13px] font-medium text-[var(--color-ink-soft)]"
          >
            Snooze 30 d
          </button>
          <button
            type="button"
            disabled={patchMut.isPending}
            onClick={() =>
              patchMut.mutate(
                { status: 'declined' },
                { onSuccess: () => navigate({ to: '/wish', search: { section: 'things' } }) },
              )
            }
            className="rounded-[12px] border-[0.5px] border-[color:rgba(181,52,26,0.45)] py-2.5 font-display text-[13px] font-medium text-[var(--color-accent)]"
          >
            Decline
          </button>
        </div>
        <button
          type="button"
          disabled={deleteMut.isPending}
          onClick={() => deleteMut.mutate()}
          className="block w-full py-1 text-center font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
        >
          delete outright
        </button>
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
