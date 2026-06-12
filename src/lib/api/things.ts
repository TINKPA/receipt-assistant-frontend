/**
 * Things resources (v2 redesign P3, tracking receipt-assistant#149) —
 * owned-items expanded list + wish-items CRUD.
 *
 * Thin pass-throughs to openapi-fetch; no business logic. The $/day
 * amortization math lives in the components (it's presentation, not
 * contract).
 */
import type { components } from '@/lib/api-types';
import { client, unwrap } from './core';

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
  return unwrap('listOwnedItems', data, error, response.status).items;
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

export async function listWishItems(opts: {
  status?: 'active' | 'converted' | 'declined';
  limit?: number;
} = {}): Promise<WishItem[]> {
  const { data, error, response } = await client.GET('/v1/wish-items', {
    params: { query: { status: opts.status, limit: opts.limit ?? 500 } },
  });
  return unwrap('listWishItems', data, error, response.status).items;
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
