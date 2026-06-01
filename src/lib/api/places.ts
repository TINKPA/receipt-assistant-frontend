/**
 * Multilingual place cache resource (#74) — single-place fetch, the
 * user-overridable `custom_name` patch, the quota-spending Google refresh,
 * and the UI name-cascade helper.
 *
 * Imports shared things from `./core` only; `components` comes straight
 * from the generated api-types. `pickCjk` (the CJK-run extractor used by
 * `placeName`) is a core mapper.
 */
import type { components } from '@/lib/api-types';
import { client, unwrap, pickCjk } from './core';

export type PlaceFull = components['schemas']['Place'];

/** Single-place fetch including the photo refs. */
export async function fetchPlace(id: string): Promise<PlaceFull> {
  const { data, error, response } = await client.GET('/v1/places/{id}', {
    params: { path: { id } },
  });
  return unwrap('fetchPlace', data, error, response.status);
}

/**
 * Update the user-overridable `custom_name` on a place. Pass `null`
 * to clear. The field was renamed from `custom_name_zh` in #79 —
 * the backend still accepts the old key as a deprecated alias for
 * one release, but new callers should use `custom_name`.
 */
export async function patchPlace(
  id: string,
  patch: { custom_name?: string | null },
): Promise<PlaceFull> {
  const { data, error, response } = await client.PATCH('/v1/places/{id}', {
    params: { path: { id } },
    body: patch,
  });
  return unwrap('patchPlace', data, error, response.status);
}

export type RefreshPlaceResult = components['schemas']['RefreshPlaceResponse'];

/**
 * Re-fetch a place from Google v1 and re-derive Layer 2 (Phase 4a / #91).
 *
 * Triggers one round of Google API quota usage per call; the merchant /
 * place detail page surfaces this as "Refresh from source" so the user
 * understands it's a quota-spending operation.
 *
 * Errors surface as RFC 7807 problem+json:
 *  - 404 — place not found
 *  - 503 — server has no GOOGLE_MAPS_API_KEY configured
 *  - 502 — upstream Google error (status passed through in `upstream_status`)
 *
 * Layer-3 protections inherited from the backend:
 *  - `custom_name` (renamed from `custom_name_zh` in #79) and
 *    OCR-sourced zh fields survive
 *  - `derivation_events` row written even on no-op refresh
 */
export async function postRefreshPlace(id: string): Promise<RefreshPlaceResult> {
  const { data, error, response } = await client.POST(
    '/v1/places/{id}/refresh',
    { params: { path: { id } } },
  );
  return unwrap('postRefreshPlace', data, error, response.status);
}

/**
 * Fallback chain for rendering a place's name in the UI:
 *   custom_name      → user override (always wins; renamed from
 *                      `custom_name_zh` in #79 — backward-compat
 *                      handled by `displayName()` and the backend's
 *                      one-release dual emit)
 *   display_name_zh  → Google v1 zh-CN call or photo-OCR fallback
 *   display_name_en  → English fallback (never disappears)
 *
 * Receipts arrive in English transliteration (`Wing On Market`), but
 * the user may know the merchant as the Chinese name (`永安`). The
 * cascade keeps both visible: render the primary in the user's
 * preferred language and the alternate as a subtitle if it differs.
 */
export function placeName(p: PlaceFull | null | undefined): {
  primary: string;
  alternate: string | null;
} | null {
  if (!p) return null;
  // Prefer the new `custom_name`; the deprecated `custom_name_zh`
  // alias is still emitted by the backend for one release window.
  const override = p.custom_name ?? p.custom_name_zh ?? null;
  const zh = override ?? pickCjk(p.display_name_zh);
  const en = p.display_name_en ?? p.formatted_address ?? null;
  if (!zh && !en) return null;
  if (zh && en && zh !== en) return { primary: zh, alternate: en };
  return { primary: zh ?? en ?? '', alternate: null };
}
