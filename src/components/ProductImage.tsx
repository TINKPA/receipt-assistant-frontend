import { useState } from 'react';
import { classGlyph } from '../lib/things';

/**
 * #133 — product imagery for the Things/Owned grid and the product
 * detail hero, mirroring `MerchantIcon` (#48) exactly. The cascade is
 * deliberately just one step:
 *
 *   product.image  (GET /v1/products/:id/image — server resolves
 *                   preferred_asset_id; 404 when none)
 *     → classGlyph(item_class)  (final fallback — the class glyph)
 *
 * There is **no inter-candidate cascade**: we never fall back to a
 * brand/merchant icon, only to the class glyph. If the product has no
 * `preferred_asset_id` (server 404s) or the bytes fail to load
 * (`<img onError>`), or there's no `productId` at all, we render the
 * glyph directly — and skip the `<img>` so we don't fire a wasted 404
 * on every render.
 *
 * Unlike `MerchantIcon` this fills its container (the grid cell's
 * `aspect-[4/3]` tile or the detail hero) rather than rendering a
 * fixed-size square, so the call sites control sizing via `className`.
 */
interface ProductImageProps {
  /** Product id (uuid) from `owned_item.product_id` / `product.id`.
   *  When null/empty, skips the image attempt and renders the glyph. */
  productId: string | null | undefined;
  /** Item class drives the fallback glyph (`durable`, `consumable`,
   *  `service`, `food_drink`, …). */
  itemClass: string | null | undefined;
  /** Optional className passthrough — applied to the outer wrapper. */
  className?: string;
}

export function ProductImage({ productId, itemClass, className }: ProductImageProps) {
  const [errored, setErrored] = useState(false);

  // No product to query OR a prior load errored → render the class
  // glyph fallback directly. Skipping the `<img>` tag also avoids a
  // wasted 404 request on every render for products with no image.
  if (!productId || errored) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          fontSize: '34px',
          color: 'var(--color-ink-faint)',
        }}
      >
        {classGlyph(itemClass)}
      </span>
    );
  }

  // The product-image endpoint is proxied through Vite at `/api/v1/...`
  // — same convention as the brand-icon path (#48) and merchant
  // photos (#67).
  const src = `/api/v1/products/${productId}/image`;

  return (
    <span
      className={className}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        // White backdrop so PNGs with transparent backgrounds (the
        // common case for clean product cutouts) read on any surface,
        // matching MerchantIcon's treatment.
        background: '#fff',
        // Light inset rule so the white tile doesn't visually merge
        // with the surrounding card on white themes.
        boxShadow: 'inset 0 0 0 1px var(--color-rule)',
      }}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
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
