import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  extractProblemMessage,
  fetchMerchant,
  fetchMerchantTransactions,
  fetchPlace,
  patchMerchant,
  patchPlace,
  pickCjk,
  postRefreshPlace,
  type MerchantTransactionRow,
  type PlaceFull,
} from '../lib/api';
import { qk } from '../lib/queryKeys';
import { CATEGORY_META } from '../categoryMeta';
import type { Category } from '../types';
import { cn } from '../lib/utils';
import { CategoryIcon } from './CategoryIcon';
import { statusBadge } from '../lib/transactionStatus';
import { receiptLink, brandLink } from '../lib/navLinks';

interface MerchantDetailProps {
  /** Either a merchant row UUID (preferred) or a kebab-case brand_id
   *  slug (legacy — backend resolves to the first matching row).
   *  Renamed from `brandId` once the API contract clarified that a
   *  merchant detail page is per-location, not per-brand. */
  merchantId: string;
  onBack: () => void;
  onSelectReceipt?: (receiptId: string) => void;
  /** Navigate up to the BrandPage (one brand, all stores). Optional
   *  so legacy callers without brand routing keep working. */
  onSelectBrand?: (brandId: string) => void;
}

export default function MerchantDetail({ merchantId, onBack, onSelectReceipt, onSelectBrand }: MerchantDetailProps) {
  const queryClient = useQueryClient();

  // Primary read: merchant detail + its transactions, collapsed onto a
  // single cache entry keyed by `qk.merchant(merchantId)` so the
  // brand-rename mutation below can patch it in place.
  const {
    data: merchantData,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: qk.merchant(merchantId),
    queryFn: () =>
      Promise.all([
        fetchMerchant(merchantId),
        fetchMerchantTransactions(merchantId, { limit: 100 }),
      ]).then(([detail, t]) => ({ detail, txns: t.items })),
  });
  const detail = merchantData?.detail ?? null;
  const txns = merchantData?.txns ?? null;
  const error = queryError ? extractProblemMessage(queryError) : null;

  // Dependent read: the linked place, for the multilingual name
  // fallback chain (#74). Best-effort — `retry: false` + a swallowed
  // error means a missing place / 404 just leaves `place` null and the
  // Chinese subtitle off, exactly as before. The `'none'` placeholder
  // key is never fetched because `enabled` is false.
  const placeId = detail?.merchant.place_id ?? null;
  const { data: place = null } = useQuery({
    queryKey: qk.place(placeId ?? 'none'),
    queryFn: () => fetchPlace(placeId!),
    enabled: !!placeId,
    retry: false,
  });

  // "Refresh from source" state machine. `idle` (the button is
  // armed), `pending` (Google call in flight, ~5-10s), `success`
  // (banner with `changed_keys`, auto-fades), `error` (banner with
  // problem-detail message, manual dismiss).
  const [refreshState, setRefreshState] = useState<
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'success'; changedKeys: string[] }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Re-fetch from Google and re-derive multilingual fields. On success
  // we invalidate the place query so the subtitle reflects fresh data
  // (replaces the old manual `fetchPlace` re-fetch).
  const refreshMut = useMutation({
    mutationFn: () => postRefreshPlace(place!.id),
    onMutate: () => setRefreshState({ kind: 'pending' }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: qk.place(place!.id) });
      setRefreshState({ kind: 'success', changedKeys: result.changed_keys });
      // Auto-dismiss the banner after 5s; user can still scroll the
      // page in the meantime. Cleared on next refresh attempt too.
      setTimeout(() => {
        setRefreshState((s) => (s.kind === 'success' ? { kind: 'idle' } : s));
      }, 5000);
    },
    onError: (e) => setRefreshState({ kind: 'error', message: extractProblemMessage(e) }),
  });

  const onRefreshFromSource = () => {
    if (!place || refreshMut.isPending) return;
    refreshMut.mutate();
  };

  // Place-level rename (#79 Phase B). Targets a SINGLE branch's
  // display name. Use this only when one location specifically needs
  // a different name from the brand-wide rename — e.g. "Costco
  // Wholesale Burbank" specifically vs. "Costco" everywhere else.
  // Most users want the brand-level rename below instead.
  const patchPlaceMut = useMutation({
    mutationFn: (patch: { custom_name: string | null }) => patchPlace(place!.id, patch),
    onSuccess: (updated) => queryClient.setQueryData(qk.place(place!.id), updated),
    onError: (e) => window.alert(`Could not save: ${extractProblemMessage(e)}`),
  });

  const onEditPlaceName = () => {
    if (!place) return;
    const current =
      place.custom_name ?? place.custom_name_zh ?? pickCjk(place.display_name_zh) ?? '';
    const next = window.prompt(
      'Override the name FOR THIS LOCATION only (clear to remove):',
      current,
    );
    if (next === null) return; // user cancelled
    patchPlaceMut.mutate({ custom_name: next.trim() === '' ? null : next.trim() });
  };

  // Brand-level rename (#79 Phase C). Propagates to every place row
  // sharing this brand_id within the workspace. Works even when
  // `place_id IS NULL` (Phase D effect). One rename here is the
  // typical user intent — fixes "Costco" everywhere instead of
  // having to override 5 separate place rows.
  const patchMerchantMut = useMutation({
    mutationFn: (patch: { custom_name: string | null }) =>
      patchMerchant(detail!.merchant.id, patch),
    onSuccess: (updated) =>
      queryClient.setQueryData(qk.merchant(merchantId), (old: typeof merchantData) =>
        old
          ? { ...old, detail: { ...old.detail, merchant: { ...old.detail.merchant, ...updated } } }
          : old,
      ),
    onError: (e) => window.alert(`Could not save: ${extractProblemMessage(e)}`),
  });

  const onEditBrandName = () => {
    if (!detail) return;
    const current = detail.merchant.custom_name ?? detail.merchant.canonical_name ?? '';
    const next = window.prompt(
      `Rename "${detail.merchant.canonical_name}" everywhere (clear to remove override):`,
      current,
    );
    if (next === null) return; // user cancelled
    patchMerchantMut.mutate({ custom_name: next.trim() === '' ? null : next.trim() });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} />
        <p className="py-16 text-center font-hand text-xl text-[var(--color-ink-muted)]">loading…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} />
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-stamp)]">
          {error || 'Merchant not found'}
        </div>
      </div>
    );
  }

  const m = detail.merchant;
  const category = (m.category as Category | null) ?? null;
  const meta = category ? CATEGORY_META[category] : null;
  const heroBg = meta?.color ?? '#C7C7CC';

  return (
    <div className="space-y-6 pb-24">
      <BackBar onBack={onBack} />

      {/* Hero */}
      {/* `photo_url` post-#67 is a relative server path
          (`/v1/merchants/:id/photo`); prefix `/api` so the Vite proxy
          forwards it to the backend. Absolute URLs (legacy Google
          attribution paths) pass through unchanged. */}
      <div
        className="relative rounded-[20px] overflow-hidden h-[180px] sm:h-[220px] flex items-end p-5"
        style={
          m.photo_url
            ? {
                backgroundImage: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%), url(${
                  m.photo_url.startsWith('http') ? m.photo_url : `/api${m.photo_url}`
                })`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: heroBg }
        }
      >
        {!m.photo_url && category && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
            <CategoryIcon category={category} size={120} />
          </div>
        )}
        <div className="relative z-10">
          {category && (
            <p className="text-[11px] tracking-[0.18em] uppercase font-medium text-white/85">
              {category}
            </p>
          )}
          <button
            type="button"
            onClick={onEditBrandName}
            title={
              m.custom_name
                ? `You renamed this brand to "${m.custom_name}". Click to edit.`
                : `Click to rename "${m.canonical_name}" everywhere.`
            }
            className={cn(
              'block text-left font-display italic font-medium text-3xl sm:text-4xl leading-tight tracking-tight transition-colors',
              m.photo_url ? 'text-white hover:text-white/80' : 'text-white hover:text-white/80',
            )}
          >
            {m.custom_name ?? m.canonical_name}
          </button>
          {(() => {
            // Chinese-name subtitle. Renders when the linked place has
            // any source of a non-English display name (Google zh-CN,
            // photo-OCR fallback, or user override). When the place has
            // no Chinese yet, offer an "+ add" affordance so the user
            // can supply one. Either path opens an inline prompt.
            if (!place) return null;
            // `custom_name` (post-#79 rename) wins, fall back to the
            // deprecated `custom_name_zh` alias during the transition
            // window, then to the derived `display_name_zh`.
            const override = place.custom_name ?? place.custom_name_zh ?? null;
            const zh = override ?? pickCjk(place.display_name_zh);
            if (zh && zh === m.canonical_name) return null;
            const source = zh
              ? override
                ? 'you'
                : place.display_name_zh_source === 'photo_ocr'
                  ? 'storefront'
                  : place.display_name_zh_source === 'receipt_ocr'
                    ? 'receipt'
                    : 'Google'
              : null;
            return (
              <button
                type="button"
                onClick={onEditPlaceName}
                className="mt-1 inline-flex items-center gap-2 group"
                title={zh ? `Source: ${source}. Click to edit (per-location override).` : 'Add a per-location override'}
              >
                {zh ? (
                  <>
                    <span className="font-display text-lg sm:text-xl text-white/90 group-hover:text-white">
                      {zh}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.15em] text-white/60 group-hover:text-white/80">
                      ✎ {source}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] uppercase tracking-[0.15em] text-white/55 group-hover:text-white/85">
                    + add custom name
                  </span>
                )}
              </button>
            );
          })()}
        </div>
        {m.photo_url && m.photo_attribution && (
          <p className="absolute right-3 bottom-2 z-10 text-[10px] text-white/70">
            {m.photo_attribution}
          </p>
        )}
      </div>

      {/* Place facet (board screen 08): the fifth facet — where you were
          standing. A stylized map with the google place_id tag +
          business status, rendered when the linked place has coordinates. */}
      {place && <PlaceFacetBlock place={place} address={m.address ?? null} />}

      {/* Stats strip */}
      <StatsStrip
        currentMonthMinor={detail.stats.current_month_spend_minor}
        lifetimeMinor={detail.stats.lifetime_spend_minor}
        count={detail.stats.transaction_count}
        currency={detail.stats.currency}
      />

      {/* Address (when enriched and no place block already shows it) */}
      {m.address && !place && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(m.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-[16px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-4 text-sm hover:bg-[var(--color-paper-deep)]/30 transition-colors"
        >
          {m.address}
        </a>
      )}

      {/* Refresh from Google source. Only when a place is linked —
          without one there's nothing to re-fetch. Wears the same
          editorial italic-display + hand-written aesthetic as the
          rest of the page. */}
      {place && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onRefreshFromSource}
            disabled={refreshState.kind === 'pending'}
            className={cn(
              'group inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]',
              'text-[var(--color-ink-muted)] hover:text-[var(--color-terracotta)]',
              'transition-colors disabled:opacity-50 disabled:cursor-wait',
            )}
            title="Re-fetch Google data and re-derive multilingual fields"
          >
            <span className="font-display italic text-base leading-none text-[var(--color-terracotta)] group-hover:translate-x-px transition-transform">
              ↻
            </span>
            {refreshState.kind === 'pending'
              ? 'refreshing from Google…'
              : 'Refresh from source'}
          </button>

          {refreshState.kind === 'success' && (
            <RefreshBanner
              tone="success"
              onDismiss={() => setRefreshState({ kind: 'idle' })}
            >
              {refreshState.changedKeys.length === 0
                ? 'Google had nothing new.'
                : `Updated ${refreshState.changedKeys.length} field${
                    refreshState.changedKeys.length === 1 ? '' : 's'
                  }: ${refreshState.changedKeys.join(', ')}.`}
            </RefreshBanner>
          )}
          {refreshState.kind === 'error' && (
            <RefreshBanner
              tone="error"
              onDismiss={() => setRefreshState({ kind: 'idle' })}
            >
              {refreshState.message}
            </RefreshBanner>
          )}
        </div>
      )}

      {/* Back-to-Brand callout. Surfaces the upward path to the brand
          rollup (the page where the user can see "all Starbucks
          locations together"). Only renders when the caller provides
          a brand navigation handler — and we always have brand_id from
          the merchant row, so the callout shows whenever the prop is
          wired up. */}
      {onSelectBrand && (
        <Link
          {...brandLink(m.brand_id)}
          data-testid="merchant-back-to-brand"
          className={cn(
            'group w-full flex items-center justify-between gap-3',
            'rounded-[16px] border border-dashed border-[var(--color-terracotta)]/40',
            'bg-[var(--color-terracotta)]/5 px-4 py-3',
            'text-left transition-colors hover:bg-[var(--color-terracotta)]/10',
          )}
        >
          <span className="text-[13px] text-[var(--color-ink-soft)]">
            See <strong className="text-[var(--color-ink)]">{m.custom_name ?? m.canonical_name}</strong> across all locations
          </span>
          <span className="font-hand text-lg text-[var(--color-terracotta)] group-hover:translate-x-px transition-transform">
            Brand page →
          </span>
        </Link>
      )}

      {/* Transaction history */}
      <div className="space-y-3">
        <h2 className="font-display italic font-medium text-xl leading-none">
          Transaction history
        </h2>
        {(!txns || txns.length === 0) ? (
          <p className="font-hand text-lg text-[var(--color-ink-muted)] py-4">
            no entries yet —
          </p>
        ) : (
          <ul className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] divide-y divide-[var(--color-rule-soft)]">
            {txns.map((tx) => (
              <li key={tx.id}>
                <MerchantTxnRow tx={tx} onSelect={onSelectReceipt} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Place facet block (board screen 08): the merchant's location as a
 * first-class "place" — a stylized map with the google place_id tag and
 * business status. The map is decorative (a CSS street grid, not a real
 * tile) but the pin offset is derived from the real lat/lng fraction so
 * distinct locations look distinct; tapping opens Google Maps.
 */
function PlaceFacetBlock({ place, address }: { place: NonNullable<PlaceFull>; address: string | null }) {
  const frac = (n: number) => {
    const f = Math.abs(n) % 1;
    return Math.min(0.82, Math.max(0.18, f)); // keep the pin off the edges
  };
  const left = `${(frac(place.lng) * 100).toFixed(0)}%`;
  const top = `${(frac(place.lat) * 100).toFixed(0)}%`;
  const mapsHref =
    place.google_maps_uri ??
    (address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : undefined);
  const statusLabel = place.business_status
    ? place.business_status.toLowerCase().replace(/_/g, ' ')
    : null;
  const isOpen = place.business_status === 'OPERATIONAL';
  const placeIdShort = place.google_place_id
    ? `${place.google_place_id.slice(0, 6)}…${place.google_place_id.slice(-3)}`
    : null;

  return (
    <section className="space-y-2.5">
      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-[132px] overflow-hidden rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)]"
        style={{
          background: [
            'linear-gradient(0deg, transparent 47%, var(--color-rule-soft) 47%, var(--color-rule-soft) 53%, transparent 53%)',
            'linear-gradient(90deg, transparent 30%, var(--color-rule-soft) 30%, var(--color-rule-soft) 34%, transparent 34%)',
            'linear-gradient(90deg, transparent 68%, var(--color-rule-soft) 68%, var(--color-rule-soft) 71%, transparent 71%)',
            'linear-gradient(24deg, transparent 58%, var(--color-rule-soft) 58%, var(--color-rule-soft) 62%, transparent 62%)',
            'var(--color-paper-deep)',
          ].join(','),
        }}
      >
        <span
          aria-hidden="true"
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-paper-warm)]"
          style={{ left, top, background: 'var(--color-plum)', boxShadow: '0 0 0 1px var(--color-plum), 0 4px 10px rgba(110,63,95,0.45)' }}
        />
        {placeIdShort && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full border-[0.5px] border-[var(--color-rule-soft)] bg-[color:rgba(251,247,238,0.92)] px-2 py-[3px] font-mono text-[8.5px] tracking-[0.04em] text-[var(--color-ink-soft)]">
            place_id · {placeIdShort}
          </span>
        )}
      </a>

      <div className="rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-1">
        {statusLabel && (
          <Row
            label="status"
            value={
              <span className={isOpen ? 'text-[var(--color-olive)]' : 'text-[var(--color-ink-soft)]'}>
                ● {statusLabel}
              </span>
            }
          />
        )}
        {(place.formatted_address_en ?? place.formatted_address ?? address) && (
          <Row
            label="address"
            value={
              <span className="text-right">
                {place.formatted_address_en ?? place.formatted_address ?? address}
              </span>
            }
          />
        )}
        {place.primary_type && <Row label="type" value={place.primary_type.replace(/_/g, ' ')} />}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-rule-soft)] py-2 last:border-b-0">
      <span className="flex-shrink-0 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="min-w-0 truncate text-[11px] font-medium text-[var(--color-ink)]">{value}</span>
    </div>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center text-[11px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 hover:text-[var(--color-ink)] transition-colors"
      >
        <span className="font-display italic text-lg leading-none text-[var(--color-terracotta)]">←</span>
        Back
      </button>
    </div>
  );
}

function StatsStrip({
  currentMonthMinor,
  lifetimeMinor,
  count,
  currency,
}: {
  currentMonthMinor: number;
  lifetimeMinor: number;
  count: number;
  currency: string;
}) {
  const fmt = (minor: number) =>
    (minor / 100).toLocaleString(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCell label="This month" value={fmt(currentMonthMinor)} />
      <StatCell label="All-time" value={fmt(lifetimeMinor)} />
      <StatCell label="Entries" value={String(count)} />
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display italic font-medium text-xl leading-none tnum">
        {value}
      </p>
    </div>
  );
}

function MerchantTxnRow({
  tx,
  onSelect,
}: {
  tx: MerchantTransactionRow;
  onSelect?: (id: string) => void;
}) {
  const badge = statusBadge(tx.status);
  const isVoided = tx.status === 'voided';
  // Body — a real <Link> (renders <a href>) so right-click → Open in
  // New Tab, Cmd-click, and hover URL preview all work. When no
  // navigation handler is wired up it falls back to a plain div.
  const body = (
    <>
      <div className="min-w-0">
        <p className="font-display italic font-medium text-[16px] leading-tight truncate">
          {tx.payee ?? '—'}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.04em] uppercase text-[var(--color-ink-muted)] truncate">
          {formatDay(tx.occurred_on)}
          {badge && (
            <span className={cn(
              'ml-1',
              badge.tone === 'red' && 'text-[var(--color-stamp)]',
              badge.tone === 'green' && 'text-[color:rgb(52,168,83)]',
            )}>· {badge.label}</span>
          )}
        </p>
      </div>
      <span className={cn(
        'font-display italic font-medium text-[17px] tnum',
        isVoided && 'line-through opacity-60',
      )}>
        {(tx.total_minor / 100).toLocaleString(undefined, {
          style: 'currency',
          currency: tx.currency,
          maximumFractionDigits: 2,
        })}
      </span>
    </>
  );
  const rowClassName =
    'w-full text-left grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 hover:bg-[var(--color-paper-deep)]/30 transition-colors';
  return onSelect ? (
    <Link {...receiptLink(tx.id)} className={cn('block', rowClassName)}>
      {body}
    </Link>
  ) : (
    <div className={rowClassName}>{body}</div>
  );
}

function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Reprocess feedback banner. Matches the editorial / handwritten
 * aesthetic of the page — terracotta success accent, stamped red for
 * errors. Used by both refresh (here) and re-extract (ReceiptDetail).
 */
function RefreshBanner({
  tone,
  children,
  onDismiss,
}: {
  tone: 'success' | 'error';
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-[14px] px-4 py-3 text-sm',
        tone === 'success' &&
          'border border-[var(--color-terracotta)]/30 bg-[var(--color-terracotta)]/8 text-[var(--color-ink)]',
        tone === 'error' &&
          'border border-[var(--color-stamp)]/40 bg-[var(--color-stamp)]/5 text-[var(--color-stamp)]',
      )}
    >
      <p className="font-hand text-base leading-snug">{children}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[11px] uppercase tracking-[0.16em] opacity-60 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        dismiss
      </button>
    </div>
  );
}
