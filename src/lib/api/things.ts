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

/**
 * Save a want from one image (a screenshot of a recommendation, a photo of
 * a storefront). The server answers at once with a wish whose
 * `capture_status` is `reading`; the image is read in the background, so
 * the caller polls the wish (or the list) until that changes.
 *
 * Large images are downscaled first, as receipt uploads are. If the
 * browser cannot decode the file the original goes up untouched, so the
 * server's own message (it names HEIC, for one) is what the user reads.
 */
export async function captureWishItem(file: File, note?: string): Promise<WishItem> {
  let payload: File = file;
  if (file.type.startsWith('image/')) {
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
  return unwrap('captureWishItem', data, error, response.status);
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
