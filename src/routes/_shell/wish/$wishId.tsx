import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteWishItem,
  listOwnedItemsExpanded,
  listWishItems,
  patchWishItem,
} from '../../../lib/api/things';
import { wishPerDay, perDay, isSnoozed } from '../../../lib/things';
import { useBack } from '../../../lib/useBack';
import { cn } from '../../../lib/utils';

export const Route = createFileRoute('/_shell/wish/$wishId')({
  component: WishDetailRoute,
});

/**
 * /wish/$id — projected cost + acquisition decision (board screen 13):
 * target ÷ planned days = projected $/day, framed against the current
 * portfolio daily. Convert / snooze 30d / decline.
 */
function WishDetailRoute() {
  const { wishId } = Route.useParams();
  const back = useBack('/wish');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);

  const { data: wishes = [], isLoading } = useQuery({
    queryKey: ['wish-items'],
    queryFn: () => listWishItems({ status: 'active' }),
  });
  const { data: owned = [] } = useQuery({
    queryKey: ['owned-items', 'expanded'],
    queryFn: () => listOwnedItemsExpanded({ include_retired: true }),
  });
  const wish = wishes.find((w) => w.id === wishId);

  const ownedDaily = useMemo(
    () => owned.filter((i) => !i.retired_at).reduce((s, i) => s + (perDay(i) ?? 0), 0),
    [owned],
  );

  const patchMut = useMutation({
    mutationFn: (body: Parameters<typeof patchWishItem>[1]) => patchWishItem(wishId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wish-items'] }),
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteWishItem(wishId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wish-items'] });
      navigate({ to: '/wish' });
    },
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
      <p className="py-16 text-center font-display italic text-[var(--color-ink-muted)]">
        Wish not found (it may have been converted or declined).
      </p>
    );
  }

  const pd = wishPerDay(wish);
  const target = wish.target_price_minor != null ? wish.target_price_minor / 100 : null;
  const snoozed = isSnoozed(wish);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={back}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          ← Wishes
        </button>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          wish · acquisition planning
        </span>
      </div>

      {/* hero */}
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
        <span className="absolute bottom-3 left-3 rounded-full bg-[color:rgba(251,247,238,0.92)] px-2.5 py-1 font-mono text-[8.5px] text-[var(--color-ink-soft)]">
          ● {snoozed ? `snoozed until ${wish.snoozed_until}` : wish.urgency} · saved{' '}
          {wish.created_at.slice(0, 10)}
        </span>
        <span className="absolute right-3 top-3 rounded-[4px] border border-[var(--color-ink-faint)] px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)] [transform:rotate(2deg)]">
          wish
        </span>
      </div>

      <div>
        <h1 className="font-display text-[22px] font-medium leading-tight tracking-tight">
          {wish.title}
        </h1>
        {wish.notes && (
          <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">{wish.notes}</p>
        )}
      </div>

      {/* projected cost */}
      <div>
        <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          PROJECTED DAILY COST
          {wish.planned_days ? ` · IF USED ${(wish.planned_days / 365).toFixed(0)} YEARS` : ''}
        </p>
        <p className="mt-1 font-display text-[2.6rem] font-light leading-none tracking-tight tnum">
          {pd !== null ? `$${pd.toFixed(2)}` : '—'}
          <span className="ml-1 text-[15px] tracking-[0.06em] text-[var(--color-ink-soft)]">/day</span>
        </p>
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
        <Calc label="target" value={target !== null ? `$${target.toLocaleString()}` : '—'} />
        <span className="font-display text-[15px] text-[var(--color-ink-faint)]">÷</span>
        <Calc
          label="planned d"
          value={wish.planned_days ? wish.planned_days.toLocaleString() : '—'}
        />
        <span className="font-display text-[15px] text-[var(--color-ink-faint)]">=</span>
        <Calc label="$/day" value={pd !== null ? `$${pd.toFixed(2)}` : '—'} accent />
      </div>

      {err && <p className="text-center text-xs text-[var(--color-stamp)]">{err}</p>}

      {/* decision actions */}
      <div className="space-y-2 pb-4">
        <button
          type="button"
          disabled={patchMut.isPending}
          onClick={() =>
            patchMut.mutate(
              { status: 'converted' },
              { onSuccess: () => navigate({ to: '/wish' }) },
            )
          }
          className="block w-full rounded-[14px] bg-[var(--color-ink)] py-3.5 text-center font-display text-[15px] font-medium text-[var(--color-paper)]"
        >
          Convert to purchase
          <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-paper-fold)]">
            marks converted · link the transaction after it lands
          </span>
        </button>
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
                { onSuccess: () => navigate({ to: '/wish' }) },
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
