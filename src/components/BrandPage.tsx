import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  extractProblemMessage,
  fetchBrandRollup,
  type BrandRollup,
  type BrandRollupLocation,
  type BrandRollupRecentRow,
  type BrandRollupSibling,
} from '../lib/api';
import { cn } from '../lib/utils';
import { brandLink, merchantLink, receiptLink } from '../lib/navLinks';
import { MerchantIcon } from './MerchantIcon';
import { statusBadge } from '../lib/transactionStatus';

interface BrandPageProps {
  brandId: string;
  onBack: () => void;
  /** Navigate to MerchantDetail for one specific location (UUID). */
  onSelectMerchant?: (merchantId: string) => void;
  /** Navigate to the brand-detail page for a sibling brand (e.g.
   *  Costco Wholesale → Costco Gas via shared parent_id). */
  onSelectBrand?: (brandId: string) => void;
  /** Navigate to a single receipt (UUID). */
  onSelectReceipt?: (receiptId: string) => void;
}

/**
 * BrandPage — the brand-level rollup (one brand across all its
 * physical stores). New page introduced alongside the 4-tier
 * Ledger → Receipt → Merchant → Brand hierarchy.
 *
 * Data: `GET /v1/brands/:brandId/rollup`. Sections:
 *   1. Brand hero (icon + name + domain).
 *   2. Brand stats — this month + all time + locations + visits.
 *   3. Locations list — per-merchant rows, sorted by spend desc.
 *   4. Recent transactions across the brand (top 20).
 *   5. Sibling brands callout — only if this brand has a `parent_id`
 *      that another brand also points at (Costco Wholesale ↔ Gas).
 */
export default function BrandPage({
  brandId,
  onBack,
  onSelectMerchant,
  onSelectBrand,
  onSelectReceipt,
}: BrandPageProps) {
  const [rollup, setRollup] = useState<BrandRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBrandRollup(brandId)
      .then((r) => {
        if (!cancelled) {
          setRollup(r);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(extractProblemMessage(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} />
        <p className="py-16 text-center font-hand text-xl text-[var(--color-ink-muted)]">
          loading…
        </p>
      </div>
    );
  }
  if (error || !rollup) {
    return (
      <div className="space-y-4">
        <BackBar onBack={onBack} />
        <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] py-12 text-center text-[var(--color-stamp)]">
          {error || 'Brand not found'}
        </div>
      </div>
    );
  }

  const { brand, stats, locations, recent_transactions, sibling_brands } = rollup;

  return (
    <div className="space-y-6 pb-24" data-testid="brand-page">
      <BackBar onBack={onBack} />

      <BrandHero
        brandId={brand.brand_id}
        name={brand.name}
        domain={brand.domain}
        hasIcon={brand.preferred_asset_id !== null}
      />

      <StatsStrip
        currentMonthMinor={stats.current_month_spend_minor}
        lifetimeMinor={stats.lifetime_spend_minor}
        locationCount={stats.location_count}
        transactionCount={stats.transaction_count}
        currency={stats.currency}
      />

      <LocationsCard
        locations={locations}
        onSelectMerchant={onSelectMerchant}
      />

      <RecentList
        rows={recent_transactions}
        onSelectReceipt={onSelectReceipt}
      />

      {sibling_brands.length > 0 && (
        <SiblingsCard
          siblings={sibling_brands}
          onSelectBrand={onSelectBrand}
        />
      )}
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
        <span className="font-display italic text-lg leading-none text-[var(--color-terracotta)]">
          ←
        </span>
        Back
      </button>
    </div>
  );
}

function BrandHero({
  brandId,
  name,
  domain,
  hasIcon,
}: {
  brandId: string;
  name: string;
  domain: string | null;
  hasIcon: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="h-16 w-16 rounded-[16px] overflow-hidden flex-shrink-0 border border-[var(--color-rule)] bg-[var(--color-surface)] flex items-center justify-center">
        {hasIcon ? (
          <MerchantIcon brandId={brandId} category={null} size={64} />
        ) : (
          <span className="font-display italic font-medium text-2xl text-[var(--color-ink-muted)]">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="font-display italic font-medium text-3xl sm:text-4xl leading-none tracking-tight">
          {name}
        </h1>
        {domain && (
          <p className="mt-1.5 text-[12px] font-mono text-[var(--color-ink-muted)]">
            {domain}
          </p>
        )}
      </div>
    </div>
  );
}

function StatsStrip({
  currentMonthMinor,
  lifetimeMinor,
  locationCount,
  transactionCount,
  currency,
}: {
  currentMonthMinor: number;
  lifetimeMinor: number;
  locationCount: number;
  transactionCount: number;
  currency: string;
}) {
  const fmt = (minor: number) =>
    (minor / 100).toLocaleString(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCell
        label="This month"
        value={fmt(currentMonthMinor)}
        sub={`${locationCount} ${locationCount === 1 ? 'location' : 'locations'}`}
      />
      <StatCell
        label="All-time"
        value={fmt(lifetimeMinor)}
        sub={`${transactionCount} ${transactionCount === 1 ? 'entry' : 'entries'}`}
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display italic font-medium text-2xl leading-none tnum">
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">{sub}</p>
      )}
    </div>
  );
}

function LocationsCard({
  locations,
  onSelectMerchant,
}: {
  locations: BrandRollupLocation[];
  onSelectMerchant?: (merchantId: string) => void;
}) {
  if (locations.length === 0) {
    return (
      <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-5 py-8 text-center">
        <p className="font-hand text-lg text-[var(--color-ink-muted)]">
          no locations under this brand yet —
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h2 className="font-display italic font-medium text-xl leading-none">
        Locations ({locations.length})
      </h2>
      <ul className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] divide-y divide-[var(--color-rule-soft)]">
        {locations.map((loc) => (
          <li key={loc.merchant.id}>
            <LocationRow loc={loc} onSelectMerchant={onSelectMerchant} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocationRow({
  loc,
  onSelectMerchant,
}: {
  loc: BrandRollupLocation;
  onSelectMerchant?: (merchantId: string) => void;
}) {
  const m = loc.merchant;
  const fmt = (minor: number) =>
    (minor / 100).toLocaleString(undefined, {
      style: 'currency',
      currency: loc.stats.currency,
      maximumFractionDigits: 0,
    });
  // Compact "city, ST" from the full address — keeps the row at one line
  // even on narrow phones. Address full is only useful inside the
  // location's own detail page.
  const cityState = (() => {
    if (!m.address) return null;
    const parts = m.address.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    if (parts.length >= 4) {
      const city = parts[parts.length - 3];
      const stateZip = parts[parts.length - 2];
      const st = stateZip?.split(/\s+/)[0];
      return st ? `${city}, ${st}` : city ?? null;
    }
    return parts[parts.length - 2] ?? null;
  })();
  const body = (
    <>
      <div className="h-11 w-11 rounded-[12px] overflow-hidden bg-[var(--color-paper-deep)]/40 flex items-center justify-center flex-shrink-0">
        {m.photo_url ? (
          <img
            src={m.photo_url.startsWith('http') ? m.photo_url : `/api${m.photo_url}`}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="text-[var(--color-ink-muted)] text-xs">📍</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-display italic font-medium text-[16px] leading-tight truncate">
          {m.custom_name ?? m.canonical_name}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.04em] uppercase text-[var(--color-ink-muted)] truncate">
          {cityState ?? m.address ?? 'no address'}
          {' · '}
          {loc.stats.transaction_count}
          {' '}
          {loc.stats.transaction_count === 1 ? 'visit' : 'visits'}
        </p>
      </div>
      <div className="text-right">
        <p className="font-display italic font-medium text-[16px] tnum">
          {fmt(loc.stats.lifetime_spend_minor)}
        </p>
        {loc.stats.current_month_spend_minor > 0 && (
          <p className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-[0.08em] mt-0.5">
            {fmt(loc.stats.current_month_spend_minor)} this mo
          </p>
        )}
      </div>
    </>
  );
  const baseClass = cn(
    'w-full text-left grid grid-cols-[44px_1fr_auto] items-center gap-3 px-5 py-3',
    'transition-colors',
  );
  // Real <a href> (renders via TanStack <Link>) so right-click → Open in
  // New Tab, Cmd-click, and hover URL preview all work. Without a
  // navigate handler the row is non-interactive — a plain <div> with no href.
  return onSelectMerchant ? (
    <Link
      {...merchantLink(m.id)}
      data-testid={`brand-location-row-${m.id}`}
      className={cn(baseClass, 'block hover:bg-[var(--color-paper-deep)]/30 cursor-pointer')}
    >
      {body}
    </Link>
  ) : (
    <div
      data-testid={`brand-location-row-${m.id}`}
      className={cn(baseClass, 'cursor-default')}
    >
      {body}
    </div>
  );
}

function RecentList({
  rows,
  onSelectReceipt,
}: {
  rows: BrandRollupRecentRow[];
  onSelectReceipt?: (receiptId: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="font-display italic font-medium text-xl leading-none">
        Recent transactions
      </h2>
      <ul className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] divide-y divide-[var(--color-rule-soft)]">
        {rows.map((r) => (
          <li key={r.id}>
            <RecentRow row={r} onSelectReceipt={onSelectReceipt} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentRow({
  row,
  onSelectReceipt,
}: {
  row: BrandRollupRecentRow;
  onSelectReceipt?: (receiptId: string) => void;
}) {
  const badge = statusBadge(row.status);
  const isVoided = row.status === 'voided';
  const merchantLabel = row.merchant_custom_name ?? row.merchant_canonical_name;
  const body = (
    <>
      <div className="min-w-0">
        <p className="font-display italic font-medium text-[15px] leading-tight truncate">
          {row.payee ?? merchantLabel}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.04em] uppercase text-[var(--color-ink-muted)] truncate">
          {merchantLabel}
          {' · '}
          {formatDay(row.occurred_on)}
          {badge && (
            <span
              className={cn(
                'ml-1',
                badge.tone === 'red' && 'text-[var(--color-stamp)]',
                badge.tone === 'green' && 'text-[color:rgb(52,168,83)]',
              )}
            >
              · {badge.label}
            </span>
          )}
        </p>
      </div>
      <span
        className={cn(
          'font-display italic font-medium text-[16px] tnum',
          isVoided && 'line-through opacity-60',
        )}
      >
        {(row.total_minor / 100).toLocaleString(undefined, {
          style: 'currency',
          currency: row.currency,
          maximumFractionDigits: 2,
        })}
      </span>
    </>
  );
  const baseClass = cn(
    'w-full text-left grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3',
    'transition-colors',
  );
  // Real <a href> via <Link> for native browser affordances; falls back to
  // a non-interactive <div> when no navigate handler is provided.
  return onSelectReceipt ? (
    <Link
      {...receiptLink(row.id)}
      className={cn(baseClass, 'block hover:bg-[var(--color-paper-deep)]/30 cursor-pointer')}
    >
      {body}
    </Link>
  ) : (
    <div className={cn(baseClass, 'cursor-default')}>{body}</div>
  );
}

function SiblingsCard({
  siblings,
  onSelectBrand,
}: {
  siblings: BrandRollupSibling[];
  onSelectBrand?: (brandId: string) => void;
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-[var(--color-terracotta)]/40 bg-[var(--color-terracotta)]/5 px-4 py-4">
      <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-terracotta-deep)]">
        Sibling brands
      </p>
      <p className="mt-1 text-[12px] text-[var(--color-ink-soft)]">
        Same parent — same group, separate brands (e.g. Costco Wholesale ↔ Costco Gas).
      </p>
      <ul className="mt-3 space-y-1.5">
        {siblings.map((s) => {
          const body = (
            <>
              <div className="flex items-center gap-2 min-w-0">
                {s.icon_url ? (
                  <MerchantIcon brandId={s.brand_id} category={null} size={24} />
                ) : (
                  <span className="h-6 w-6 rounded-[7px] border border-[var(--color-rule)] flex items-center justify-center text-[11px] text-[var(--color-ink-muted)] flex-shrink-0">
                    {s.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="text-[14px] font-medium text-[var(--color-ink)] truncate">
                  {s.name}
                </span>
                <span className="text-[11px] text-[var(--color-ink-muted)] flex-shrink-0">
                  {s.location_count} {s.location_count === 1 ? 'loc' : 'locs'}
                </span>
              </div>
              <span className="font-hand text-base text-[var(--color-terracotta)] flex-shrink-0">
                open →
              </span>
            </>
          );
          const baseClass = cn(
            'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[12px]',
            'transition-colors',
          );
          return (
            <li key={s.brand_id}>
              {onSelectBrand ? (
                <Link
                  {...brandLink(s.brand_id)}
                  data-testid={`brand-sibling-${s.brand_id}`}
                  className={cn(baseClass, 'hover:bg-[var(--color-surface)] cursor-pointer')}
                >
                  {body}
                </Link>
              ) : (
                <div
                  data-testid={`brand-sibling-${s.brand_id}`}
                  className={cn(baseClass, 'cursor-default')}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
