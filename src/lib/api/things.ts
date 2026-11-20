/**
 * Things resources (v2 redesign P3, tracking receipt-assistant#149) —
 * owned-items expanded list + wish-items CRUD.
 *
 * Thin pass-throughs to openapi-fetch; no business logic. The $/day
 * amortization math lives in the components (it's presentation, not
 * contract).
 */
import type { components } from '@/lib/api-types';
import { client, compressImage, unwrap } from './core';

export type OwnedItemExpanded = components['schemas']['OwnedItemExpanded'];
export type WishItem = components['schemas']['WishItem'];
export type CreateWishItemRequest = components['schemas']['CreateWishItemRequest'];
export type UpdateWishItemRequest = components['schemas']['UpdateWishItemRequest'];
export type UpdateOwnedItemRequest = components['schemas']['UpdateOwnedItemRequest'];

export async function listOwnedItemsExpanded(opts: {
  include_retired?: boolean;
  limit?: number;
} = {}): Promise<OwnedItemExpanded[]> {
  const { data, error, response } = await client.GET('/v1/owned-items', {
    params: {
      query: {
        expand: 'product' as const,
        include_retired: opts.include_retired,
        limit: opts.limit ?? 500,
      },
    },
  });
  return unwrap('listOwnedItemsExpanded', data, error, response.status).items;
}

export type CreateOwnedItemRequest = components['schemas']['CreateOwnedItemRequest'];

/**
 * Put a product on the Things shelf.
 *
 * The price comes from the linked purchase unless the user sets
 * `cost_basis_minor` on the item (the detail page's "Cost" field). `GET /v1/owned-items?expand=product` derives
 * `paid_minor` as `COALESCE(ti.effective_total_minor, ti.line_total_minor)`
 * over `LEFT JOIN transaction_items ti ON ti.id = o.transaction_item_id`,
 * and `perDay()` returns null without it. So an owned item created with
 * only `product_id` renders "—" instead of a $/day forever: **always pass
 * `transaction_item_id` when the purchase is known.** `acquired_on` is the
 * other half — it's the denominator of the amortization.
 */
export async function createOwnedItem(
  body: CreateOwnedItemRequest,
): Promise<components['schemas']['OwnedItem']> {
  const { data, error, response } = await client.POST('/v1/owned-items', { body });
  return unwrap('createOwnedItem', data, error, response.status);
}

export async function patchOwnedItem(
  id: string,
  body: UpdateOwnedItemRequest,
): Promise<components['schemas']['OwnedItem']> {
  const { data, error, response } = await client.PATCH('/v1/owned-items/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap('patchOwnedItem', data, error, response.status);
}

export type WishKind = WishItem['kind'];

export async function listWishItems(opts: {
  status?: 'active' | 'converted' | 'declined';
  kind?: WishKind;
  limit?: number;
} = {}): Promise<WishItem[]> {
  const { data, error, response } = await client.GET('/v1/wish-items', {
    params: { query: { status: opts.status, kind: opts.kind, limit: opts.limit ?? 500 } },
  });
  return unwrap('listWishItems', data, error, response.status).items;
}

export async function getWishItem(id: string): Promise<WishItem> {
  const { data, error, response } = await client.GET('/v1/wish-items/{id}', {
    params: { path: { id } },
  });
  return unwrap('getWishItem', data, error, response.status);
}

/** What a capture upload answered: the wish, and whether it already
 *  existed (the same image was saved before; it is not read again). */
export interface CaptureResult {
  wish: WishItem;
  existing: boolean;
}

/** HEIC/HEIF: what an iPhone camera writes. Browsers other than Safari
 *  cannot decode it, so it is neither compressed nor previewed here; the
 *  server converts it to JPEG. Some pickers leave `type` empty, hence the
 *  extension check. */
export function isHeic(file: File): boolean {
  return /^image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/**
 * Save a want from one image (a screenshot of a recommendation, a photo of
 * a storefront). A new image answers 202 with a wish whose
 * `capture_status` is `reading`; it is read in the background, so the
 * caller polls the wish (or the list) until that changes. An image the
 * workspace already has answers 200 with the wish it made the first time
 * (`existing`), in whatever state that wish is.
 *
 * Large images are downscaled first, as receipt uploads are, except HEIC
 * (see `isHeic`). If the browser cannot decode the file the original goes
 * up untouched, so the server's own message is what the user reads.
 */
export async function captureWishItem(file: File, note?: string): Promise<CaptureResult> {
  let payload: File = file;
  if (file.type.startsWith('image/') && !isHeic(file)) {
    try {
      payload = await compressImage(file);
    } catch {
      payload = file;
    }
  }
  const form = new FormData();
  form.append('file', payload, file.name);
  if (note?.trim()) form.append('note', note.trim());
  const { data, error, response } = await client.POST('/v1/wish-items/capture', {
    body: form as unknown as { file: string },
    bodySerializer: (b) => b as unknown as FormData,
  });
  const wish = unwrap('captureWishItem', data, error, response.status);
  return { wish, existing: response.status === 200 };
}

/** Read a captured wish's image again. 202 with the wish back in `reading`. */
export async function retryWishCapture(id: string): Promise<WishItem> {
  const { data, error, response } = await client.POST('/v1/wish-items/{id}/capture/retry', {
    params: { path: { id } },
  });
  return unwrap('retryWishCapture', data, error, response.status);
}

/** The image a wish was captured from; only when `has_image`. */
export function wishImageUrl(id: string): string {
  return `/api/v1/wish-items/${id}/image`;
}

export type WishPlaceCandidate = components['schemas']['WishPlaceCandidate'];

/** Up to five Google places for `q`, to pick a wish's place from. Send
 *  the pick back as `google_place_id` in `patchWishItem`. */
export async function searchWishPlaces(q: string): Promise<WishPlaceCandidate[]> {
  const { data, error, response } = await client.GET('/v1/wish-items/place-search', {
    params: { query: { q } },
  });
  return unwrap('searchWishPlaces', data, error, response.status).candidates;
}

export async function createWishItem(body: CreateWishItemRequest): Promise<WishItem> {
  const { data, error, response } = await client.POST('/v1/wish-items', { body });
  return unwrap('createWishItem', data, error, response.status);
}

export async function patchWishItem(
  id: string,
  body: UpdateWishItemRequest,
): Promise<WishItem> {
  const { data, error, response } = await client.PATCH('/v1/wish-items/{id}', {
    params: { path: { id } },
    body,
  });
  return unwrap('patchWishItem', data, error, response.status);
}

export async function deleteWishItem(id: string): Promise<void> {
  const { error, response } = await client.DELETE('/v1/wish-items/{id}', {
    params: { path: { id } },
  });
  if (error) unwrap('deleteWishItem', undefined, error, response.status);
}
