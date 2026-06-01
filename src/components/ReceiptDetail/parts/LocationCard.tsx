import { Link } from '@tanstack/react-router';
import { merchantLink } from '../../../lib/navLinks';
import type { ReceiptView } from '../../../lib/api';

// FE#15 + design #35 (pastel-pillow): persistent Location card. Whole card
// click opens Google Maps for the actual merchant (uses google_place_id
// + payee), not just the address. "View all visits" remains the in-app
// path to MerchantDetail.
export function LocationCard({
  place,
  merchantId,
  payee,
}: {
  place: ReceiptView['place'];
  merchantId: string | null;
  payee: string | null;
}) {
  const addr = place?.formatted_address?.trim() || null;
  const cityState = (() => {
    if (!addr) return null;
    const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    if (place?.country_code === 'US' && parts.length >= 4) {
      const city = parts[parts.length - 3];
      const stateZip = parts[parts.length - 2];
      const st = stateZip?.split(/\s+/)[0];
      return st ? `${city}, ${st}` : city ?? null;
    }
    return parts[parts.length - 2] ?? null;
  })();

  // Build a Maps URL that resolves to the merchant's place card, not just
  // the address. We only pass `query_place_id` when we believe the
  // place_id points to a real business — when the backend's geocoder
  // matched a premise / street / postal code instead, the place_id
  // resolves to a bare address and Google faithfully shows that. In
  // those cases we drop the place_id and rely on Google's text search,
  // which finds the actual merchant at that address (e.g. "Tokyo
  // Central 1740 Artesia Blvd, Gardena, CA").
  const GEOCODING_FALLBACK_TYPES = new Set([
    'premise',
    'subpremise',
    'street_address',
    'route',
    'intersection',
    'postal_code',
    'plus_code',
    'locality',
    'sublocality',
    'neighborhood',
    'administrative_area_level_1',
    'administrative_area_level_2',
    'administrative_area_level_3',
    'country',
  ]);
  const trustPlaceId =
    !!place?.google_place_id &&
    !!place?.primary_type &&
    !GEOCODING_FALLBACK_TYPES.has(place.primary_type);

  const mapsUrl = (() => {
    if (!place) return null;
    const name = payee?.trim() || place.display_name_en || '';
    const q = encodeURIComponent(`${name} ${addr ?? ''}`.trim());
    if (!q) return null;
    const base = `https://www.google.com/maps/search/?api=1&query=${q}`;
    return trustPlaceId
      ? `${base}&query_place_id=${encodeURIComponent(place.google_place_id)}`
      : base;
  })();
  const openMaps = () => {
    if (mapsUrl) window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  if (!place) {
    return (
      <div className="rounded-[14px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
        <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--color-ink-muted)]">
          Location
        </p>
        <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
          Location unavailable —{' '}
          <span className="italic">geocoding may be disabled or failed.</span>
        </p>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openMaps}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMaps();
        }
      }}
      className="relative cursor-pointer overflow-hidden rounded-[28px] px-5 py-5 transition-transform duration-150 ease-out hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-terracotta)]"
      style={{
        background: 'linear-gradient(135deg,#FDE2E4 0%,#E2F0CB 50%,#CDE7F7 100%)',
        boxShadow:
          'inset 0 4px 0 rgba(255,255,255,0.6), 0 14px 30px -10px rgba(180,140,180,0.32), 0 1px 2px rgba(60,40,20,0.04)',
        fontFamily: 'Quicksand, ui-sans-serif, system-ui, sans-serif',
        color: '#3A3550',
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-[70px] -right-[60px] h-[180px] w-[180px] rounded-full"
        style={{ background: 'rgba(255,255,255,0.55)', filter: 'blur(14px)' }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[30px] left-[30%] h-[100px] w-[100px] rounded-full"
        style={{ background: 'rgba(255,180,200,0.35)', filter: 'blur(20px)' }}
      />

      <p
        className="relative text-[11px] font-medium tracking-[0.18em] uppercase"
        style={{
          color: '#7A6F92',
          fontFamily: 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif',
        }}
      >
        Location
      </p>

      <div className="relative mt-3 flex items-center gap-4">
        <div
          aria-hidden="true"
          className="shrink-0 inline-flex items-center justify-center"
          style={{
            width: 60,
            height: 60,
            fontSize: 28,
            background: 'linear-gradient(135deg,#FFB5C2,#FFE2A8)',
            borderRadius: '42% 58% 65% 35% / 38% 50% 50% 62%',
            boxShadow:
              '0 6px 16px -6px rgba(255,140,160,0.45), inset 0 2px 0 rgba(255,255,255,0.5)',
            animation: 'pastel-blob 8s ease-in-out infinite',
          }}
        >
          📍
        </div>
        <div className="min-w-0 flex-1">
          {cityState && (
            <p
              className="text-[20px] font-bold leading-tight"
              style={{ color: '#3A3550', letterSpacing: '-0.01em' }}
            >
              {cityState}
            </p>
          )}
          {addr && (
            <p
              className="mt-0.5 text-[13px] font-medium leading-snug"
              style={{ color: '#7A7090' }}
            >
              {addr}
            </p>
          )}
          {!cityState && !addr && (
            <p className="text-[13px] font-medium" style={{ color: '#7A7090' }}>
              Geocoded, but no street address returned.
            </p>
          )}
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openMaps();
          }}
          disabled={!mapsUrl}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors disabled:opacity-50"
          style={{
            background: 'rgba(255,255,255,0.72)',
            color: '#5A5070',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            fontFamily: 'Quicksand, ui-sans-serif, system-ui, sans-serif',
          }}
        >
          Open in Maps
          <span aria-hidden="true">↗</span>
        </button>
        {merchantId && (
          <Link
            {...merchantLink(merchantId)}
            data-testid="receipt-view-all-at-location"
            className="inline-flex items-center gap-1 text-[13px] font-semibold"
            style={{
              color: '#7A6F92',
              fontFamily: 'Quicksand, ui-sans-serif, system-ui, sans-serif',
            }}
          >
            View all visits
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
