import { useState } from 'react';
import { CategoryIcon } from './CategoryIcon';
import type { Category, TransactionType } from '../types';

/**
 * FE#48 — square icon that prefers the brand's resolved icon, falling
 * back to `CategoryIcon`. The cascade is:
 *
 *   brand.icon  (GET /v1/brands/:id/icon — server resolves
 *                preferred_asset_id from #101 Phase 2 candidates)
 *     → CategoryIcon  (final fallback — colored tile + glyph)
 *
 * The fallback is **always** `CategoryIcon`, never "the next entity's
 * brand asset" — per #48's revised AC after #101 redesign: no inter-
 * candidate cascade. If a candidate's bytes are missing on disk
 * (`<img onError>`), or if the brand has no `preferred_asset_id` yet,
 * we fall straight to the category glyph.
 *
 * `size` / `category` / `transactionType` API mirrors `CategoryIcon`
 * exactly so this is a drop-in swap at every merchant/entity call
 * site (Dashboard Recent rows, Ledger rows, ReceiptDetail AmountHero).
 * Category-only slots (Dashboard category grid, filter chips,
 * Monthly/Yearly Review breakdowns) keep using `CategoryIcon` directly.
 */
interface MerchantIconProps {
  /** Brand id (kebab-case) from `merchants.brand_id` / `merchantBrandId`.
   *  When null, skips the brand-icon attempt and renders `CategoryIcon`
   *  directly — typical for non-spending or merchant-less rows. */
  brandId: string | null | undefined;
  category: Category | null;
  transactionType?: TransactionType;
  size?: number;
  /** Optional className passthrough — applied to the outer wrapper. */
  className?: string;
}

export function MerchantIcon({
  brandId,
  category,
  transactionType,
  size = 44,
  className,
}: MerchantIconProps) {
  const [errored, setErrored] = useState(false);

  // No brand to query OR a prior load errored → use the category
  // fallback directly. Skipping the `<img>` tag also avoids a
  // wasted 404 request on every render for brands without icons.
  if (!brandId || errored) {
    return (
      <span className={className} style={{ display: 'inline-flex' }}>
        <CategoryIcon
          category={category}
          transactionType={transactionType}
          size={size}
        />
      </span>
    );
  }

  // The brand-icon endpoint is proxied through Vite at `/api/v1/...`
  // — same convention as merchant photos (#67) and place maps (#96).
  const src = `/api/v1/brands/${brandId}/icon`;
  const radius = Math.round(size * 0.32);

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        // White backdrop so SVGs/PNGs with transparent backgrounds
        // (the common case for clean brand marks) read on dark UI
        // contexts (Apple Pay-ish chrome, dark mode). The brand-color
        // surface is supplied by the icon itself.
        background: '#fff',
        // Light divider so the white square doesn't visually merge
        // with the surrounding card on white themes.
        boxShadow: 'inset 0 0 0 1px var(--color-rule)',
        flexShrink: 0,
      }}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        onError={() => setErrored(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </span>
  );
}
